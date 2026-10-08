/**
 * Transaction-safety of the junction / lookup writes.
 *
 * The bug: `tx.x.create(...).catch(() => {})` inside a Prisma interactive
 * transaction does not "ignore" a duplicate — Postgres aborts the transaction
 * (25P02) and the whole title upsert is lost. These tests run the real
 * junction functions against a fake tx whose `create` THROWS on a duplicate
 * (like Postgres) and whose `createMany({skipDuplicates})` skips (ON CONFLICT
 * DO NOTHING), with a "racer" inserting the same junction row between the
 * delete and the insert — exactly the prod race.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("./upsert-diff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./upsert-diff")>();
  const changed = async () => false; // force the rewrite path
  return {
    ...actual,
    seriesGenresUnchanged: changed,
    seriesKeywordsUnchanged: changed,
    seriesNetworksUnchanged: changed,
    seriesCreatorsUnchanged: changed,
    seriesCompaniesUnchanged: changed,
    seriesCountriesUnchanged: changed,
    seriesLanguagesUnchanged: changed,
  };
});

import {
  upsertSeriesGenres,
  upsertSeriesCompanies,
  upsertSeriesCreators,
  upsertSeriesCountries,
} from "./series-junction-upserts";
import { ensureGenres } from "./lookup-upserts";
import type { PrismaTx } from "./types";

type Row = Record<string, unknown>;

/** Minimal in-memory Prisma-ish table with a unique key. */
function table(keyOf: (r: Row) => string, autoId = false) {
  const rows = new Map<string, Row>();
  let nextId = 1;
  const calls = { create: 0, createMany: 0, findMany: 0 };
  const matches = (r: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in (v as Row)) return ((v as { in: unknown[] }).in).includes(r[k]);
      return r[k] === v;
    });
  return {
    rows,
    calls,
    async findMany(args: { where?: Row } = {}) {
      calls.findMany++;
      return [...rows.values()].filter((r) => matches(r, args.where));
    },
    async create(args: { data: Row }) {
      calls.create++;
      const k = keyOf(args.data);
      if (rows.has(k)) throw Object.assign(new Error("duplicate key"), { code: "P2002" });
      rows.set(k, { ...(autoId ? { id: nextId++ } : {}), ...args.data });
      return rows.get(k);
    },
    async createMany(args: { data: Row[]; skipDuplicates?: boolean }) {
      calls.createMany++;
      let count = 0;
      for (const d of args.data) {
        const k = keyOf(d);
        if (rows.has(k)) {
          if (!args.skipDuplicates) throw Object.assign(new Error("duplicate key"), { code: "P2002" });
          continue;
        }
        rows.set(k, { ...(autoId ? { id: nextId++ } : {}), ...d });
        count++;
      }
      return { count };
    },
    async deleteMany(args: { where?: Row } = {}) {
      for (const [k, r] of rows) if (matches(r, args.where)) rows.delete(k);
      return { count: 0 };
    },
  };
}

function fakeTx(racer?: (tx: ReturnType<typeof build>) => void) {
  const tx = build();
  if (racer) {
    // Inject the race right after each junction deleteMany.
    for (const name of ["seriesGenre", "seriesCompany", "seriesCreator", "seriesCountry"] as const) {
      const t = tx[name];
      const del = t.deleteMany.bind(t);
      t.deleteMany = async (args) => {
        const r = await del(args);
        racer(tx);
        return r;
      };
    }
  }
  return tx;
}

function build() {
  return {
    genre: table((r) => String(r.tmdbId), true),
    productionCompany: table((r) => String(r.tmdbId), true),
    person: table((r) => String(r.tmdbId), true),
    country: table((r) => String(r.code)),
    seriesGenre: table((r) => `${r.seriesId}|${r.genreId}`),
    seriesCompany: table((r) => `${r.seriesId}|${r.companyId}`),
    seriesCreator: table((r) => `${r.seriesId}|${r.personId}`),
    seriesCountry: table((r) => `${r.seriesId}|${r.countryCode}|${r.type}`),
  };
}

const asTx = (t: unknown) => t as PrismaTx;

describe("junction writes survive a racing duplicate (no 25P02)", () => {
  it("genres: a row inserted by a racing upsert is skipped, not fatal", async () => {
    const tx = fakeTx((t) => {
      // the other transaction's insert of the same junction row lands first
      void t.seriesGenre.createMany({ data: [{ seriesId: 9, genreId: 1 }], skipDuplicates: true });
    });
    await expect(
      upsertSeriesGenres(asTx(tx), 9, [
        { id: 18, name: "Drama" },
        { id: 35, name: "Comedy" },
      ])
    ).resolves.toBeUndefined();
    expect([...tx.seriesGenre.rows.keys()].sort()).toEqual(["9|1", "9|2"]);
    expect(tx.seriesGenre.calls.create).toBe(0);
  });

  it("companies + creators + countries never use per-row create()", async () => {
    const tx = fakeTx((t) => {
      void t.seriesCompany.createMany({ data: [{ seriesId: 9, companyId: 1 }], skipDuplicates: true });
      void t.seriesCreator.createMany({ data: [{ seriesId: 9, personId: 1 }], skipDuplicates: true });
      void t.seriesCountry.createMany({ data: [{ seriesId: 9, countryCode: "US", type: "ORIGIN" }], skipDuplicates: true });
    });
    await upsertSeriesCompanies(asTx(tx), 9, [{ id: 7, name: "HBO" }]);
    await upsertSeriesCreators(asTx(tx), 9, [{ id: 3, name: "A", profile_path: null }]);
    await upsertSeriesCountries(asTx(tx), 9, ["US", "US", "GB"]);
    for (const t of Object.values(tx)) expect(t.calls.create).toBe(0);
    expect(tx.seriesCountry.rows.size).toBe(2);
    expect(tx.country.rows.get("GB")).toMatchObject({ name: "GB" });
  });
});

describe("ensureGenres", () => {
  it("reads once, creates only the missing ids (skipDuplicates), maps tmdbId → db id", async () => {
    const tx = build();
    await tx.genre.createMany({ data: [{ tmdbId: 18, name: "Drama" }] });
    tx.genre.calls.createMany = 0;
    const ids = await ensureGenres(asTx(tx), [
      { id: 18, name: "Drama" },
      { id: 35, name: "Comedy" },
      { id: 35, name: "Comedy" },
    ]);
    expect(ids.get(18)).toBe(1);
    expect(ids.get(35)).toBe(2);
    expect(tx.genre.calls.createMany).toBe(1);
  });

  it("all present → no insert at all", async () => {
    const tx = build();
    await tx.genre.createMany({ data: [{ tmdbId: 18, name: "Drama" }] });
    tx.genre.calls.createMany = 0;
    await ensureGenres(asTx(tx), [{ id: 18, name: "Drama" }]);
    expect(tx.genre.calls.createMany).toBe(0);
  });
});

describe("regression guard", () => {
  it("no `.create(...).catch(` inside the hydration upsert files", () => {
    const dir = __dirname;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      // strip comments so the explanatory notes don't trip the guard
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/\.create\(\s*\{[\s\S]*?\}\s*\)\s*\.catch\(/);
    }
  });
});
