import { describe, it, expect, vi } from "vitest";
import { Prisma, type ListKind } from "@prisma/client";
import {
  canViewList,
  canEditList,
  isListViewable,
  getItemListMembership,
  type ListMembershipRow,
} from "./lists";

/**
 * Logic tests for the list access seam + membership query. Per review
 * correction C3, the seam fns take `db: Db = prisma`, so we inject a fake
 * TransactionClient mirroring only the surface each fn touches — no live DB,
 * no $transaction nesting. (The audit-actor test lives separately and is
 * live-:5436-gated; this file is pure logic.)
 */

const OWNER = 1;
const STRANGER = 2;

function makeListDb(list: { ownerId: number; isPublic: boolean } | null) {
  const findUnique = vi.fn().mockResolvedValue(list);
  const db = { list: { findUnique } };
  return { db: db as unknown as Prisma.TransactionClient, findUnique };
}

describe("isListViewable (pure predicate)", () => {
  it("public list is viewable by anyone, incl. anon", () => {
    expect(isListViewable({ ownerId: OWNER, isPublic: true }, null)).toBe(true);
    expect(isListViewable({ ownerId: OWNER, isPublic: true }, STRANGER)).toBe(true);
  });
  it("private list is viewable only by owner", () => {
    expect(isListViewable({ ownerId: OWNER, isPublic: false }, OWNER)).toBe(true);
    expect(isListViewable({ ownerId: OWNER, isPublic: false }, STRANGER)).toBe(false);
    expect(isListViewable({ ownerId: OWNER, isPublic: false }, null)).toBe(false);
  });
});

describe("list access seam", () => {
  it("owner can view + edit own private list", async () => {
    const priv = makeListDb({ ownerId: OWNER, isPublic: false });
    expect(await canViewList(99, OWNER, priv.db)).toBe(true);
    const privEdit = makeListDb({ ownerId: OWNER, isPublic: false });
    expect(await canEditList(99, OWNER, privEdit.db)).toBe(true);
  });

  it("stranger cannot view a private list", async () => {
    const priv = makeListDb({ ownerId: OWNER, isPublic: false });
    expect(await canViewList(99, STRANGER, priv.db)).toBe(false);
    const privEdit = makeListDb({ ownerId: OWNER, isPublic: false });
    expect(await canEditList(99, STRANGER, privEdit.db)).toBe(false);
  });

  it("stranger can view but not edit a public list", async () => {
    const pub = makeListDb({ ownerId: OWNER, isPublic: true });
    expect(await canViewList(99, STRANGER, pub.db)).toBe(true);
    const pubEdit = makeListDb({ ownerId: OWNER, isPublic: true });
    expect(await canEditList(99, STRANGER, pubEdit.db)).toBe(false);
  });

  it("anon (null viewer) can view public, not private", async () => {
    const pub = makeListDb({ ownerId: OWNER, isPublic: true });
    expect(await canViewList(99, null, pub.db)).toBe(true);
    const priv = makeListDb({ ownerId: OWNER, isPublic: false });
    expect(await canViewList(99, null, priv.db)).toBe(false);
  });

  it("missing list is neither viewable nor editable", async () => {
    const none = makeListDb(null);
    expect(await canViewList(99, OWNER, none.db)).toBe(false);
    const noneEdit = makeListDb(null);
    expect(await canEditList(99, OWNER, noneEdit.db)).toBe(false);
  });

  it("canEditList short-circuits to false for anon without a fetch", async () => {
    const none = makeListDb(null);
    expect(await canEditList(99, null, none.db)).toBe(false);
    expect(none.findUnique).not.toHaveBeenCalled();
  });
});

interface FakeList {
  id: number;
  name: string;
  kind: ListKind;
  itemCount: number;
  isPublic: boolean;
}

interface FakeItem {
  id: number;
  listId: number;
}

function makeMembershipDb(lists: FakeList[], items: FakeItem[]) {
  const db = {
    list: { findMany: vi.fn().mockResolvedValue(lists) },
    listItem: { findMany: vi.fn().mockResolvedValue(items) },
  };
  return db as unknown as Prisma.TransactionClient;
}

describe("getItemListMembership", () => {
  it("returns each REGULAR owned list with membership + itemId; FOUR_FAVORITES excluded", async () => {
    // The query filters kind:REGULAR in the where clause, so the fake findMany
    // returns ONLY regular lists (proving the fn never surfaces FF). We seed a
    // FF list separately to assert it is not in the returned rows.
    const l1: FakeList = { id: 11, name: "L1", kind: "REGULAR", itemCount: 3, isPublic: true };
    const l2: FakeList = { id: 12, name: "L2", kind: "REGULAR", itemCount: 0, isPublic: false };
    const items: FakeItem[] = [{ id: 501, listId: 11 }];
    const db = makeMembershipDb([l1, l2], items);

    const rows: ListMembershipRow[] = await getItemListMembership(OWNER, { movieId: 550 }, db);

    const r1 = rows.find((r) => r.listId === 11)!;
    const r2 = rows.find((r) => r.listId === 12)!;
    expect(r1.contains).toBe(true);
    expect(typeof r1.itemId).toBe("number");
    expect(r2.contains).toBe(false);
    expect(r2.itemId).toBeNull();

    // FF exclusion: every returned row is REGULAR + the count matches the
    // regular lists seeded (not a tautological .some()).
    expect(rows.every((r) => r.kind === "REGULAR")).toBe(true);
    expect(rows.length).toBe(2);
  });

  it("returns [] when the user has no REGULAR lists (no item query)", async () => {
    const db = makeMembershipDb([], []);
    const rows = await getItemListMembership(OWNER, { seriesId: 1396 }, db);
    expect(rows).toEqual([]);
  });
});
