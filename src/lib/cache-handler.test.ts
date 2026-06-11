/**
 * Tests for cache-handler.cjs — the bounded ISR disk cache.
 * The handler must NEVER let disk usage exceed BOUNDED_CACHE_MB and must
 * never throw (failures degrade to cache misses). See Jun 10 2026 incident.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BoundedCacheHandler = require("../../cache-handler.cjs");

interface HandlerInstance {
  get(key: string): Promise<{ lastModified: number; value: unknown } | null>;
  set(key: string, data: unknown, ctx: { tags?: string[] }): Promise<void>;
  revalidateTag(tags: string | string[]): Promise<void>;
  ready: Promise<void>;
  totalBytes: number;
}

let tmpDir: string;

function makeHandler(): HandlerInstance {
  return new BoundedCacheHandler({ serverDistDir: path.join(tmpDir, "server") });
}

function diskBytes(): number {
  const dir = path.join(tmpDir, "cache", "bounded-isr");
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir)
    .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bisr-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BOUNDED_CACHE_MB;
});

describe("BoundedCacheHandler", () => {
  it("round-trips a value with Buffers intact (APP_PAGE shape)", async () => {
    const handler = makeHandler();
    const value = {
      kind: "APP_PAGE",
      html: "<html>movie page</html>",
      rscData: Buffer.from("rsc-payload-bytes"),
      status: 200,
    };
    await handler.set("movie/603", value, { tags: ["movie-603"] });
    const got = await handler.get("movie/603");
    expect(got).not.toBeNull();
    const v = got?.value as typeof value;
    expect(v.html).toBe(value.html);
    expect(Buffer.isBuffer(v.rscData)).toBe(true);
    expect(v.rscData.toString()).toBe("rsc-payload-bytes");
  });

  it("returns null for unknown keys and after external file deletion", async () => {
    const handler = makeHandler();
    expect(await handler.get("never-set")).toBeNull();

    await handler.set("doomed", { kind: "FETCH", data: "x" }, {});
    const dir = path.join(tmpDir, "cache", "bounded-isr");
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    // memory layer may still serve it; a fresh handler (new process) must miss
    const fresh = makeHandler();
    expect(await fresh.get("doomed")).toBeNull();
  });

  it("evicts oldest entries to stay within the byte budget", async () => {
    process.env.BOUNDED_CACHE_MB = "1"; // 1MB budget
    const handler = makeHandler();
    const big = "x".repeat(200 * 1024); // ~200KB per entry
    for (let i = 0; i < 10; i++) {
      await handler.set(`page-${i}`, { kind: "FETCH", data: big }, {});
    }
    expect(diskBytes()).toBeLessThanOrEqual(1024 * 1024);
    // newest entry must survive, oldest must be gone
    expect(await handler.get("page-9")).not.toBeNull();
    const fresh = makeHandler();
    await fresh.ready;
    expect(await fresh.get("page-0")).toBeNull();
  });

  it("rebuilds the index from disk after restart and keeps evicting", async () => {
    process.env.BOUNDED_CACHE_MB = "1";
    const first = makeHandler();
    const big = "x".repeat(200 * 1024);
    for (let i = 0; i < 4; i++) {
      await first.set(`warm-${i}`, { kind: "FETCH", data: big }, {});
    }
    const second = makeHandler(); // simulates process restart
    for (let i = 4; i < 10; i++) {
      await second.set(`warm-${i}`, { kind: "FETCH", data: big }, {});
    }
    expect(diskBytes()).toBeLessThanOrEqual(1024 * 1024);
  });

  it("revalidateTag removes matching entries (including pre-restart ones)", async () => {
    const first = makeHandler();
    await first.set("tagged", { kind: "FETCH", data: "a" }, { tags: ["_N_T_/movie/1"] });
    await first.set("other", { kind: "FETCH", data: "b" }, { tags: ["_N_T_/series/2"] });

    const second = makeHandler(); // tags must be recoverable from disk
    await second.revalidateTag("_N_T_/movie/1");
    expect(await second.get("tagged")).toBeNull();
    expect(await second.get("other")).not.toBeNull();
  });

  it("never throws on a corrupt entry file — degrades to a miss", async () => {
    const handler = makeHandler();
    await handler.set("good", { kind: "FETCH", data: "ok" }, {});
    const dir = path.join(tmpDir, "cache", "bounded-isr");
    for (const f of fs.readdirSync(dir)) {
      fs.writeFileSync(path.join(dir, f), "NOT JSON {{{");
    }
    const fresh = makeHandler();
    await expect(fresh.get("good")).resolves.toBeNull();
  });

  it("skips entries larger than the entire budget instead of thrashing", async () => {
    process.env.BOUNDED_CACHE_MB = "1";
    const handler = makeHandler();
    await handler.set("huge", { kind: "FETCH", data: "x".repeat(2 * 1024 * 1024) }, {});
    const fresh = makeHandler();
    await fresh.ready;
    expect(await fresh.get("huge")).toBeNull();
    expect(diskBytes()).toBe(0);
  });
});
