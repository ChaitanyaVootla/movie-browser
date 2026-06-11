/**
 * Unit tests for the diff-based child-row reconciliation used by
 * shared-upserts.ts (pure helpers live in ./diff-reconcile).
 *
 * The contract under test: given existing DB rows and incoming TMDB rows,
 * `diffChildRows` must produce the minimal write set — and crucially an
 * EMPTY write set when nothing changed (the common case that used to
 * delete+reinsert everything).
 */

import { describe, it, expect } from "vitest";
import {
  diffChildRows,
  hasChanges,
  floatEq3,
  sameDate,
  keyPart,
} from "./diff-reconcile";

// Representative shapes: existing rows carry a DB id, incoming rows don't.
interface ExistingRow {
  id: number;
  key: string;
  value: string | null;
  score?: number | null;
}
interface IncomingRow {
  key: string;
  value: string | null;
  score?: number | null;
}

const byKey = (r: ExistingRow | IncomingRow) => r.key;
const sameValue = (a: ExistingRow, b: IncomingRow) =>
  a.value === b.value && floatEq3(a.score ?? null, b.score ?? null);

function diff(existing: ExistingRow[], incoming: IncomingRow[]) {
  return diffChildRows(existing, incoming, byKey, sameValue);
}

describe("diffChildRows", () => {
  it("identical sets → zero writes (toInsert/toUpdate/toDelete all empty)", () => {
    const existing: ExistingRow[] = [
      { id: 1, key: "a", value: "x" },
      { id: 2, key: "b", value: "y" },
    ];
    const incoming: IncomingRow[] = [
      { key: "b", value: "y" }, // order must not matter
      { key: "a", value: "x" },
    ];
    const d = diff(existing, incoming);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDelete).toEqual([]);
    expect(hasChanges(d)).toBe(false);
  });

  it("both sides empty → zero writes", () => {
    const d = diff([], []);
    expect(hasChanges(d)).toBe(false);
  });

  it("additions: new keys land in toInsert only", () => {
    const d = diff(
      [{ id: 1, key: "a", value: "x" }],
      [
        { key: "a", value: "x" },
        { key: "b", value: "y" },
      ]
    );
    expect(d.toInsert).toEqual([{ key: "b", value: "y" }]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDelete).toEqual([]);
  });

  it("removals: missing keys land in toDelete only (with their DB ids)", () => {
    const d = diff(
      [
        { id: 1, key: "a", value: "x" },
        { id: 2, key: "b", value: "y" },
      ],
      [{ key: "a", value: "x" }]
    );
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDelete).toEqual([{ id: 2, key: "b", value: "y" }]);
  });

  it("everything removed when incoming is empty", () => {
    const d = diff([{ id: 1, key: "a", value: "x" }], []);
    expect(d.toDelete.map((r) => r.id)).toEqual([1]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
  });

  it("field changes: matched key with differing fields lands in toUpdate as a pair", () => {
    const d = diff(
      [{ id: 7, key: "a", value: "old" }],
      [{ key: "a", value: "new" }]
    );
    expect(d.toUpdate).toEqual([
      { existing: { id: 7, key: "a", value: "old" }, incoming: { key: "a", value: "new" } },
    ]);
    expect(d.toInsert).toEqual([]);
    expect(d.toDelete).toEqual([]);
  });

  it("null vs value counts as a field change; null vs null does not", () => {
    const d = diff(
      [
        { id: 1, key: "a", value: null },
        { id: 2, key: "b", value: null },
      ],
      [
        { key: "a", value: "now-set" },
        { key: "b", value: null },
      ]
    );
    expect(d.toUpdate.map((u) => u.existing.id)).toEqual([1]);
    expect(d.toInsert).toEqual([]);
    expect(d.toDelete).toEqual([]);
  });

  it("mixed insert+update+delete in one diff", () => {
    const d = diff(
      [
        { id: 1, key: "keep", value: "same" },
        { id: 2, key: "change", value: "old" },
        { id: 3, key: "drop", value: "z" },
      ],
      [
        { key: "keep", value: "same" },
        { key: "change", value: "new" },
        { key: "add", value: "w" },
      ]
    );
    expect(d.toInsert.map((r) => r.key)).toEqual(["add"]);
    expect(d.toUpdate.map((u) => u.existing.id)).toEqual([2]);
    expect(d.toDelete.map((r) => r.id)).toEqual([3]);
  });

  it("float jitter within 3-decimal tolerance → no update", () => {
    const d = diff(
      [{ id: 1, key: "a", value: "x", score: 7.1234567 }],
      [{ key: "a", value: "x", score: 7.1230001 }]
    );
    expect(hasChanges(d)).toBe(false);
  });

  it("float change beyond 3-decimal tolerance → update", () => {
    const d = diff(
      [{ id: 1, key: "a", value: "x", score: 7.123 }],
      [{ key: "a", value: "x", score: 7.125 }]
    );
    expect(d.toUpdate).toHaveLength(1);
  });

  it("duplicate keys in incoming (multiset): 2 incoming vs 1 existing inserts exactly one", () => {
    const d = diff(
      [{ id: 1, key: "dup", value: "x" }],
      [
        { key: "dup", value: "x" },
        { key: "dup", value: "x" },
      ]
    );
    expect(d.toInsert).toEqual([{ key: "dup", value: "x" }]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDelete).toEqual([]);
  });

  it("duplicate keys in existing (multiset): 2 existing vs 1 incoming deletes exactly one", () => {
    const d = diff(
      [
        { id: 1, key: "dup", value: "x" },
        { id: 2, key: "dup", value: "x" },
      ],
      [{ key: "dup", value: "x" }]
    );
    expect(d.toDelete.map((r) => r.id)).toEqual([2]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
  });

  it("equal-count duplicate keys pair in order (first-with-first)", () => {
    const d = diff(
      [
        { id: 1, key: "dup", value: "a" },
        { id: 2, key: "dup", value: "b" },
      ],
      [
        { key: "dup", value: "a" },
        { key: "dup", value: "changed" },
      ]
    );
    // First incoming pairs with id=1 (same) → no write; second pairs with id=2 → update.
    expect(d.toUpdate).toEqual([
      {
        existing: { id: 2, key: "dup", value: "b" },
        incoming: { key: "dup", value: "changed" },
      },
    ]);
    expect(d.toInsert).toEqual([]);
    expect(d.toDelete).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const existing: ExistingRow[] = [
      { id: 1, key: "a", value: "x" },
      { id: 2, key: "b", value: "y" },
    ];
    const incoming: IncomingRow[] = [{ key: "a", value: "x" }];
    const existingCopy = structuredClone(existing);
    const incomingCopy = structuredClone(incoming);
    diff(existing, incoming);
    expect(existing).toEqual(existingCopy);
    expect(incoming).toEqual(incomingCopy);
  });

  it("works with composite keys built via keyPart (credits-style)", () => {
    type Credit = {
      id?: number;
      personTmdbId: number;
      creditType: string;
      character: string | null;
      job: string | null;
      creditOrder: number | null;
    };
    const key = (r: Credit) =>
      `${r.creditType}|${r.personTmdbId}|${keyPart(r.character)}|${keyPart(r.job)}`;
    const d = diffChildRows<Credit, Credit>(
      [
        { id: 1, personTmdbId: 10, creditType: "CAST", character: "Neo", job: null, creditOrder: 0 },
        { id: 2, personTmdbId: 11, creditType: "CREW", character: null, job: "Director", creditOrder: null },
      ],
      [
        // order changed → update
        { personTmdbId: 10, creditType: "CAST", character: "Neo", job: null, creditOrder: 1 },
        // character renamed → delete old + insert new (different key)
        { personTmdbId: 11, creditType: "CREW", character: null, job: "Producer", creditOrder: null },
      ],
      key,
      (a, b) => a.creditOrder === b.creditOrder
    );
    expect(d.toUpdate.map((u) => u.existing.id)).toEqual([1]);
    expect(d.toDelete.map((r) => r.id)).toEqual([2]);
    expect(d.toInsert.map((r) => r.job)).toEqual(["Producer"]);
  });
});

describe("floatEq3 (TMDB float-jitter tolerance, popularity-sync precedent)", () => {
  it("treats sub-millis differences as equal", () => {
    expect(floatEq3(1.6180001, 1.6179999)).toBe(true);
    expect(floatEq3(7.123, 7.1234)).toBe(true);
  });

  it("detects real changes at 3 decimals", () => {
    expect(floatEq3(7.123, 7.124)).toBe(false);
    expect(floatEq3(0, 0.001)).toBe(false);
  });

  it("null/undefined semantics: null==null, null!=number, null==undefined", () => {
    expect(floatEq3(null, null)).toBe(true);
    expect(floatEq3(undefined, null)).toBe(true);
    expect(floatEq3(null, 0)).toBe(false);
    expect(floatEq3(0, null)).toBe(false);
    expect(floatEq3(0, 0)).toBe(true);
  });
});

describe("sameDate", () => {
  it("compares by epoch millis", () => {
    expect(sameDate(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(true);
    expect(sameDate(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:01Z"))).toBe(false);
  });

  it("null/undefined compare equal to each other, unequal to dates", () => {
    expect(sameDate(null, null)).toBe(true);
    expect(sameDate(undefined, null)).toBe(true);
    expect(sameDate(null, new Date())).toBe(false);
  });
});

describe("keyPart", () => {
  it("distinguishes null from the literal string 'null'", () => {
    expect(keyPart(null)).not.toBe(keyPart("null"));
    expect(keyPart(undefined)).toBe(keyPart(null));
  });

  it("stringifies numbers and strings", () => {
    expect(keyPart(42)).toBe("42");
    expect(keyPart("Neo")).toBe("Neo");
  });
});
