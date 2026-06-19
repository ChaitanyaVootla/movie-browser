import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { setUserRating } from "./ratings";

/**
 * Unit tests for setUserRating's keep/delete decision with the heart (`liked`)
 * as a first-class signal. We inject a fake tx `Db` (db !== prisma) so the
 * function runs `run(db)` directly — no real DB, no $transaction nesting.
 */

type ExistingRow = { id: number; rating: number | null; score: number | null; liked: boolean | null };

function makeDb(existing: ExistingRow | null) {
  const calls = {
    delete: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const db = {
    userRating: {
      findFirst: vi.fn().mockResolvedValue(existing),
      delete: calls.delete,
      update: calls.update,
      create: calls.create,
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  // The fake mirrors only the surface setUserRating touches.
  return { db: db as unknown as Prisma.TransactionClient, calls };
}

const movieInput = { itemId: 550, itemType: "movie" as const };

describe("setUserRating — heart-aware keep/delete", () => {
  it("(a) heart-only create: liked:true with score/thumb undefined → row created with liked:true", async () => {
    const { db, calls } = makeDb(null);
    await setUserRating(1, { ...movieInput, liked: true }, db);
    expect(calls.create).toHaveBeenCalledTimes(1);
    expect(calls.delete).not.toHaveBeenCalled();
    const data = calls.create.mock.calls[0][0].data;
    expect(data.liked).toBe(true);
    expect(data.rating).toBeNull();
    expect(data.score).toBeNull();
  });

  it("(b) clear score, keep heart: existing {score:8,liked:true}, input {score:null} → row kept, score null, liked true", async () => {
    const { db, calls } = makeDb({ id: 7, rating: null, score: 8, liked: true });
    await setUserRating(1, { ...movieInput, score: null }, db);
    expect(calls.delete).not.toHaveBeenCalled();
    expect(calls.update).toHaveBeenCalledTimes(1);
    const data = calls.update.mock.calls[0][0].data;
    expect(data.score).toBeNull();
    expect(data.liked).toBe(true);
  });

  it("(c) clear everything: existing {score:8,liked:false}, input {score:null} → row deleted", async () => {
    const { db, calls } = makeDb({ id: 7, rating: null, score: 8, liked: false });
    await setUserRating(1, { ...movieInput, score: null }, db);
    expect(calls.delete).toHaveBeenCalledTimes(1);
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.create).not.toHaveBeenCalled();
  });

  it("(d) un-heart last signal: existing {liked:true,score:null,thumb:null}, input {liked:false} → deleted", async () => {
    const { db, calls } = makeDb({ id: 7, rating: null, score: null, liked: true });
    await setUserRating(1, { ...movieInput, liked: false }, db);
    expect(calls.delete).toHaveBeenCalledTimes(1);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("preserves an existing heart when liked is undefined (no clobber)", async () => {
    const { db, calls } = makeDb({ id: 7, rating: null, score: 5, liked: true });
    await setUserRating(1, { ...movieInput, score: 9 }, db);
    expect(calls.update).toHaveBeenCalledTimes(1);
    const data = calls.update.mock.calls[0][0].data;
    expect(data.score).toBe(9);
    expect(data.liked).toBe(true);
  });
});
