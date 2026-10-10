/**
 * Embedding-space state (review findings, Oct 10 2026): a transient μ read
 * error must not downgrade a known centered space to raw (that flapped every
 * centered row through a raw recompute and back), and rows built against an
 * older μ must refresh. (vi.resetModules per test → compare space KINDS, not
 * object identity with a top-level RAW_SPACE import.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TASTE_ALGO_VERSION } from "@/lib/taste/constants";

const h = vi.hoisted(() => ({
  readEmbeddingStats: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/server/db/postgres/social/taste", () => ({
  readEmbeddingStats: h.readEmbeddingStats,
  readBaselineMeta: vi.fn(),
  readBaselineCounts: vi.fn(),
  readTasteRow: vi.fn(),
  readTasteVectors: vi.fn(),
}));
vi.mock("@/server/db/postgres/social/taste-dirty", () => ({ markTasteDirty: vi.fn() }));
vi.mock("./compute", () => ({ computeAndStoreTaste: vi.fn(), fullFacetsColumn: () => ({}) }));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: h.warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const MU_AT = new Date("2026-10-10T19:00:00Z");
const stats = { mean: [0.6, 0.8, 0], std: [], count: 20_000, computedAt: MU_AT };

beforeEach(() => {
  vi.resetModules();
  h.readEmbeddingStats.mockReset();
  h.warn.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("getTasteSpaceState", () => {
  it("reads μ once per TTL and reports when it was computed", async () => {
    h.readEmbeddingStats.mockResolvedValue(stats);
    const { getTasteSpaceState } = await import("./baseline-cache");
    const a = await getTasteSpaceState();
    const b = await getTasteSpaceState();
    expect(a.space.kind).toBe("centered");
    expect(a.meanAt).toEqual(MU_AT);
    expect(a.known).toBe(true);
    expect(b.space).toBe(a.space);
    expect(h.readEmbeddingStats).toHaveBeenCalledTimes(1);
  });

  it("no μ stored (fresh env) = raw, and that IS known", async () => {
    h.readEmbeddingStats.mockResolvedValue(null);
    const { getTasteSpaceState } = await import("./baseline-cache");
    const state = await getTasteSpaceState();
    expect(state).toMatchObject({ meanAt: null, known: true });
    expect(state.space.kind).toBe("raw");
  });

  it("a read error after a good read keeps the last good space (never downgrades to raw) and logs", async () => {
    vi.useFakeTimers();
    h.readEmbeddingStats.mockResolvedValueOnce(stats).mockRejectedValue(new Error("connection reset"));
    const { getTasteSpaceState, getTasteSpace } = await import("./baseline-cache");
    const good = await getTasteSpaceState();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // past the 1h TTL
    const after = await getTasteSpaceState();
    expect(after.known).toBe(true);
    expect(after.space).toBe(good.space);
    expect(after.meanAt).toEqual(MU_AT);
    expect((await getTasteSpace()).kind).toBe("centered");
    expect(h.warn).toHaveBeenCalledWith(expect.objectContaining({ action: "taste.space_read_failed", keptLastGood: true }));
  });

  it("a read error with nothing cached → known:false, retried after SPACE_RETRY_MS (not an hour)", async () => {
    vi.useFakeTimers();
    h.readEmbeddingStats.mockRejectedValueOnce(new Error("down")).mockResolvedValue(stats);
    const { getTasteSpaceState, SPACE_RETRY_MS } = await import("./baseline-cache");
    const first = await getTasteSpaceState();
    expect(first.known).toBe(false);
    expect(first.space.kind).toBe("raw");
    await getTasteSpaceState(); // inside the retry window → cached
    expect(h.readEmbeddingStats).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SPACE_RETRY_MS + 1);
    const recovered = await getTasteSpaceState();
    expect(recovered.known).toBe(true);
    expect(recovered.space.kind).toBe("centered");
  });

  it("fresh: true bypasses the cache (the recompute path)", async () => {
    h.readEmbeddingStats.mockResolvedValue(stats);
    const { getTasteSpaceState } = await import("./baseline-cache");
    await getTasteSpaceState();
    await getTasteSpaceState({ fresh: true });
    expect(h.readEmbeddingStats).toHaveBeenCalledTimes(2);
  });
});

describe("isFresh", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    dirty: false,
    updatedAt: new Date(),
    computedAt: new Date("2026-10-10T20:00:00Z"),
    algoVersion: TASTE_ALGO_VERSION,
    publicSnapshot: null,
    facets: {},
    axes: [],
    clusters: [],
    signalCount: 1,
    positiveCount: 1,
    space: "centered" as const,
    ...over,
  });
  const now = new Date("2026-10-10T21:00:00Z").getTime();

  it("current space + computed after μ → fresh", async () => {
    h.readEmbeddingStats.mockResolvedValue(stats);
    const { isFresh, getTasteSpaceState } = await import("./index");
    expect(isFresh(row(), await getTasteSpaceState(), now)).toBe(true);
  });

  it("computed BEFORE the current μ → stale (rows from an older μ refresh)", async () => {
    h.readEmbeddingStats.mockResolvedValue(stats);
    const { isFresh, getTasteSpaceState } = await import("./index");
    expect(isFresh(row({ computedAt: new Date("2026-10-10T18:59:00Z") }), await getTasteSpaceState(), now)).toBe(false);
  });

  it("another space → stale", async () => {
    h.readEmbeddingStats.mockResolvedValue(stats);
    const { isFresh, getTasteSpaceState } = await import("./index");
    expect(isFresh(row({ space: "raw" }), await getTasteSpaceState(), now)).toBe(false);
  });

  it("unknown space (read failed, nothing cached) → the centered row is NOT recomputed in a guessed raw space", async () => {
    h.readEmbeddingStats.mockRejectedValue(new Error("down"));
    const { isFresh, getTasteSpaceState } = await import("./index");
    const state = await getTasteSpaceState();
    expect(state.known).toBe(false);
    expect(isFresh(row(), state, now)).toBe(true);
    expect(isFresh(row({ dirty: true }), state, now)).toBe(false); // other staleness still applies
  });
});
