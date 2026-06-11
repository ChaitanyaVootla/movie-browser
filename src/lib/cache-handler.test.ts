/**
 * Tests for cache-handler.cjs — the bounded ISR disk cache.
 * The handler must NEVER let disk usage exceed BOUNDED_CACHE_MB and must
 * never throw (failures degrade to cache misses). See Jun 10 2026 incident.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomBytes } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BoundedCacheHandler = require("../../cache-handler.cjs");

interface HandlerInstance {
  get(key: string): Promise<{ lastModified: number; value: unknown } | null>;
  set(key: string, data: unknown, ctx: { tags?: string[] }): Promise<void>;
  revalidateTag(tags: string | string[]): Promise<void>;
  ready: Promise<void>;
  store: { ready: Promise<void> };
  totalBytes: number;
}

let tmpDir: string;

function makeHandler(): HandlerInstance {
  return new BoundedCacheHandler({ serverDistDir: path.join(tmpDir, "server") });
}

function diskBytes(): number {
  const dir = path.join(tmpDir, "cache", "bounded-isr");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).reduce((sum, f) => {
    try {
      return sum + fs.statSync(path.join(dir, f)).size;
    } catch {
      return sum; // raced an async eviction unlink — vanished file counts as 0
    }
  }, 0);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bisr-test-"));
  BoundedCacheHandler._clearStores(); // each test starts as a fresh process
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
    // memory layer may still serve it; a fresh process must miss
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    expect(await fresh.get("doomed")).toBeNull();
  });

  it("evicts oldest entries to stay within the byte budget", async () => {
    process.env.BOUNDED_CACHE_MB = "1"; // 1MB budget
    const handler = makeHandler();
    const big = randomBytes(150 * 1024).toString("base64"); // ~200KB incompressible
    for (let i = 0; i < 10; i++) {
      await handler.set(`page-${i}`, { kind: "FETCH", data: big }, {});
    }
    expect(diskBytes()).toBeLessThanOrEqual(1024 * 1024);
    // newest entry must survive, oldest must be gone
    expect(await handler.get("page-9")).not.toBeNull();
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    await fresh.store.ready;
    expect(await fresh.get("page-0")).toBeNull();
  });

  it("rebuilds the index from disk after restart and keeps evicting", async () => {
    process.env.BOUNDED_CACHE_MB = "1";
    const first = makeHandler();
    const big = randomBytes(150 * 1024).toString("base64"); // incompressible
    for (let i = 0; i < 4; i++) {
      await first.set(`warm-${i}`, { kind: "FETCH", data: big }, {});
    }
    BoundedCacheHandler._clearStores();
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

    BoundedCacheHandler._clearStores();
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
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    await expect(fresh.get("good")).resolves.toBeNull();
  });

  it("skips entries larger than the entire budget instead of thrashing", async () => {
    process.env.BOUNDED_CACHE_MB = "1";
    const handler = makeHandler();
    await handler.set("huge", { kind: "FETCH", data: randomBytes(1600 * 1024).toString("base64") }, {});
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    await fresh.store.ready;
    expect(await fresh.get("huge")).toBeNull();
    expect(diskBytes()).toBe(0);
  });
});

describe("Next 16 segmentData (Map) round-trip", () => {
  it("revives segmentData as a real Map with Buffer values", async () => {
    const handler = makeHandler();
    const value = {
      kind: "APP_PAGE",
      html: "<html>x</html>",
      rscData: Buffer.from("rsc"),
      segmentData: new Map([
        ["/movie/603", Buffer.from("segment-a")],
        ["/movie/603/layout", Buffer.from("segment-b")],
      ]),
    };
    await handler.set("seg-page", value, {});
    BoundedCacheHandler._clearStores(); // simulate restart: force disk read
    const fresh = makeHandler();
    const got = await fresh.get("seg-page");
    const v = got?.value as typeof value;
    expect(v.segmentData instanceof Map).toBe(true);
    expect(v.segmentData.get("/movie/603")?.toString()).toBe("segment-a");
    expect(Buffer.isBuffer(v.segmentData.get("/movie/603/layout"))).toBe(true);
  });
});

describe("gzip storage", () => {
  it("stores entries gzipped on disk and reads them back", async () => {
    const handler = makeHandler();
    const value = { kind: "FETCH", data: "z".repeat(50 * 1024) };
    await handler.set("gz-entry", value, {});
    const dir = path.join(tmpDir, "cache", "bounded-isr");
    const file = fs.readdirSync(dir)[0];
    const raw = fs.readFileSync(path.join(dir, file));
    expect(raw[0]).toBe(0x1f); // gzip magic
    expect(raw[1]).toBe(0x8b);
    expect(raw.length).toBeLessThan(10 * 1024); // 50KB repetitive → tiny
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    const got = await fresh.get("gz-entry");
    expect((got?.value as typeof value).data.length).toBe(50 * 1024);
  });

  it("still reads legacy plain-JSON entries", async () => {
    const handler = makeHandler();
    await handler.store.ready;
    const dir = path.join(tmpDir, "cache", "bounded-isr");
    // simulate a pre-gzip entry written by the old handler
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha1").update("legacy-key").digest("hex");
    fs.writeFileSync(
      path.join(dir, `${hash}.json`),
      JSON.stringify({ lastModified: 123, tags: [], value: { kind: "FETCH", data: "old" } }),
    );
    BoundedCacheHandler._clearStores();
    const fresh = makeHandler();
    const got = await fresh.get("legacy-key");
    expect((got?.value as { data: string }).data).toBe("old");
  });
});
