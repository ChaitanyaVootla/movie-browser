/**
 * Regression tests for L2 janitor EVENT-LOOP SAFETY.
 *
 * WHY: the sweeps were originally fully synchronous (`readdirSync` +
 * `readFileSync` + `JSON.parse` + `statSync` + `unlinkSync` over every file in
 * every namespace). That was invisible for months because the janitor was never
 * actually started. The day it was wired up against a `.cache/` holding ~700k
 * files it BLOCKED Node's event loop and prod returned 502s on every
 * cache-miss path — `next-server` in `STAT=Dl` / `WCHAN=folio_wait_bit_commo`,
 * 0% user CPU, 57% iowait, listening on :3002 but answering nothing.
 *
 * These tests assert the loop keeps getting control DURING a sweep. A purely
 * synchronous implementation cannot pass them.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FILE_COUNT = 1200; // > SWEEP_BATCH (200) so several yields must occur

let root: string;

/** Count event-loop turns granted while `work` is in flight. */
async function loopTurnsDuring<T>(work: () => Promise<T>): Promise<number> {
  let turns = 0;
  let stop = false;
  const spin = () => {
    if (stop) return;
    turns++;
    setImmediate(spin);
  };
  setImmediate(spin);
  await work();
  stop = true;
  return turns;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cache-janitor-"));
  const dir = join(root, ".cache", "movie");
  mkdirSync(dir, { recursive: true });
  // Long-expired entries so cleanup has real work to do.
  const entry = JSON.stringify({ v: 1, data: { x: 1 }, expiresAt: 1, compressed: false });
  for (let i = 0; i < FILE_COUNT; i++) {
    writeFileSync(join(dir, `${String(i).padStart(6, "0")}.json`), entry);
  }
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules(); // CACHE_ROOT is captured at module load
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("L2 janitor event-loop safety", () => {
  it("cleanupExpiredCache yields to the event loop while sweeping", async () => {
    const { cleanupExpiredCache } = await import("./cache-service");
    const turns = await loopTurnsDuring(() => cleanupExpiredCache());
    expect(turns).toBeGreaterThan(1);
  });

  it("enforceNamespaceSizeLimits yields to the event loop while statting", async () => {
    const { enforceNamespaceSizeLimits } = await import("./cache-service");
    const turns = await loopTurnsDuring(() => enforceNamespaceSizeLimits());
    expect(turns).toBeGreaterThan(1);
  });

  it("cleanupExpiredCache actually deletes expired entries", async () => {
    const { cleanupExpiredCache } = await import("./cache-service");
    const { deleted } = await cleanupExpiredCache();
    expect(deleted).toBeGreaterThan(0);
  });

  it("both sweeps return promises (a sync regression would fail here)", async () => {
    const mod = await import("./cache-service");
    expect(mod.cleanupExpiredCache()).toBeInstanceOf(Promise);
    expect(mod.enforceNamespaceSizeLimits()).toBeInstanceOf(Promise);
  });

  it("a missing namespace directory is skipped, not thrown on", async () => {
    const { enforceNamespaceSizeLimits } = await import("./cache-service");
    // Only `.cache/movie` exists; every other namespace dir is absent.
    await expect(enforceNamespaceSizeLimits()).resolves.toMatchObject({ evicted: 0 });
  });
});
