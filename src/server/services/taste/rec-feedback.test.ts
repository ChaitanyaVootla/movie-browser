import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  del: vi.fn(),
  markTasteDirty: vi.fn(),
  evict: vi.fn(),
  clearSeed: vi.fn(),
}));
vi.mock("@/server/db/postgres/social/rec-feedback", () => ({ upsertRecFeedback: h.upsert, deleteRecFeedback: h.del }));
vi.mock("@/server/db/postgres/social/taste-dirty", () => ({ markTasteDirty: h.markTasteDirty }));
vi.mock("./recommend", () => ({ evictRecsCache: h.evict }));
vi.mock("./more-like-this", () => ({ clearSeedCache: h.clearSeed }));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn() } }));

const { recordRecFeedbackFor, undoRecFeedbackFor } = await import("./rec-feedback");

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.upsert.mockResolvedValue(true);
  h.del.mockResolvedValue(1);
});

describe("recordRecFeedbackFor", () => {
  it("writes, marks taste dirty and evicts the user's caches", async () => {
    const out = await recordRecFeedbackFor(4, { mediaType: "movie", id: 603, kind: "DISMISS", rowId: "cluster-1", anchorKey: "m:550" }, "cue");
    expect(out).toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledWith({
      userId: 4,
      mediaType: "movie",
      id: 603,
      kind: "DISMISS",
      rowId: "cluster-1",
      anchorKey: "m:550",
      source: "cue",
    });
    expect(h.markTasteDirty).toHaveBeenCalledWith(4);
    expect(h.evict).toHaveBeenCalledWith(4);
    expect(h.clearSeed).toHaveBeenCalledWith(4);
  });
  it("rejects invalid input without writing", async () => {
    expect(await recordRecFeedbackFor(4, { mediaType: "movie", id: -1, kind: "DISMISS" }, "ui")).toEqual({ ok: false, error: "invalid" });
    expect(await recordRecFeedbackFor(4, { mediaType: "movie", id: 1, kind: "DISMISS", anchorKey: "x" }, "ui")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });
  it("unknown title → not_found, nothing marked", async () => {
    h.upsert.mockResolvedValue(false);
    expect(await recordRecFeedbackFor(4, { mediaType: "series", id: 9, kind: "DISMISS" }, "ui")).toEqual({ ok: false, error: "not_found" });
    expect(h.markTasteDirty).not.toHaveBeenCalled();
  });
  it("never throws", async () => {
    h.upsert.mockRejectedValue(new Error("db down"));
    expect(await recordRecFeedbackFor(4, { mediaType: "movie", id: 1, kind: "DISMISS" }, "ui")).toEqual({ ok: false, error: "failed" });
  });
});

describe("undoRecFeedbackFor", () => {
  it("deletes and marks dirty; undoing nothing is still ok", async () => {
    expect(await undoRecFeedbackFor(4, { mediaType: "movie", id: 603, kind: "DISMISS" })).toEqual({ ok: true });
    expect(h.del).toHaveBeenCalledWith(4, "movie", 603, "DISMISS");
    expect(h.markTasteDirty).toHaveBeenCalledTimes(1);
    h.del.mockResolvedValue(0);
    expect(await undoRecFeedbackFor(4, { mediaType: "movie", id: 603, kind: "DISMISS" })).toEqual({ ok: true });
    expect(h.markTasteDirty).toHaveBeenCalledTimes(1);
  });
});
