/**
 * Tests for cache-handler.cjs — the bounded ISR disk cache.
 * The handler must NEVER let disk usage exceed BOUNDED_CACHE_MB and must
 * never throw (failures degrade to cache misses). See Jun 10 2026 incident.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  store: { ready: Promise<void>; scan: Promise<void> };
  totalBytes: number;
}

let tmpDir: string;

function makeHandler(): HandlerInstance {
  return new BoundedCacheHandler({ serverDistDir: path.join(tmpDir, "server") });
}

function diskBytes(): number {
  const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
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
    const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
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
    // Non-path tags → the bounded background scan (path tags take the fast path).
    await first.set("tagged", { kind: "FETCH", data: "a" }, { tags: ["tmdb:movie:1"] });
    await first.set("other", { kind: "FETCH", data: "b" }, { tags: ["tmdb:series:2"] });

    BoundedCacheHandler._clearStores();
    const second = makeHandler(); // tags must be recoverable from disk
    await second.revalidateTag("tmdb:movie:1");
    await second.store.scan;
    expect(await second.get("tagged")).toBeNull();
    expect(await second.get("other")).not.toBeNull();
  });

  it("never throws on a corrupt entry file — degrades to a miss", async () => {
    const handler = makeHandler();
    await handler.set("good", { kind: "FETCH", data: "ok" }, {});
    const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
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

describe("build namespacing (Jun 12: stale-build HTML survived deploys)", () => {
  it("reads BUILD_ID for the namespace and prunes other builds' entries", async () => {
    // a previous build's namespace + a legacy flat entry
    const parent = path.join(tmpDir, "cache", "bounded-isr");
    fs.mkdirSync(path.join(parent, "old-build-id"), { recursive: true });
    fs.writeFileSync(path.join(parent, "old-build-id", "stale.json"), "{}");
    fs.writeFileSync(path.join(parent, "legacy-flat.json"), "{}");

    const handler = makeHandler();
    await handler.store.ready;
    await handler.set("fresh", { kind: "FETCH", data: "new" }, {});
    // prune is fire-and-forget; poll briefly
    for (let i = 0; i < 50 && fs.existsSync(path.join(parent, "old-build-id")); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(fs.existsSync(path.join(parent, "old-build-id"))).toBe(false);
    expect(fs.existsSync(path.join(parent, "legacy-flat.json"))).toBe(false);
    expect(await handler.get("fresh")).not.toBeNull();
    // entries live under the per-build dir ("dev" fallback without BUILD_ID)
    expect(fs.readdirSync(path.join(parent, "dev")).length).toBeGreaterThan(0);
  });
});

describe("gzip storage", () => {
  it("stores entries gzipped on disk and reads them back", async () => {
    const handler = makeHandler();
    const value = { kind: "FETCH", data: "z".repeat(50 * 1024) };
    await handler.set("gz-entry", value, {});
    const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
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
    const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
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

describe("page invalidation (Oct 2026: revalidatePath was a silent no-op for pages)", () => {
  const page = (html: string) => ({
    kind: "APP_PAGE",
    html,
    rscData: Buffer.from("rsc"),
    status: 200,
    // Next 16 puts a page's tags ONLY here — set() gets no ctx.tags.
    headers: { "x-next-cache-tags": "_N_T_/layout,_N_T_/movie/157336/interstellar" },
  });

  it("revalidateTag matches a page's x-next-cache-tags header (incl. after restart)", async () => {
    const first = makeHandler();
    await first.set("/movie/157336/interstellar", page("<old>"), {});
    await first.set("/movie/1/other", { ...page("<x>"), headers: {} }, {});
    BoundedCacheHandler._clearStores();
    const second = makeHandler();
    await second.revalidateTag(["_N_T_/movie/157336/interstellar"]);
    expect(await second.get("/movie/157336/interstellar")).toBeNull();
    expect(await second.get("/movie/1/other")).not.toBeNull();
  });

  it("invalidateKeys drops memory, index and disk copies of exact keys", async () => {
    const handler = makeHandler();
    await handler.set("/movie/157336/interstellar", page("<old>"), {});
    await handler.set("/movie/2/keep", page("<keep>"), {});
    expect(await handler.get("/movie/157336/interstellar")).not.toBeNull(); // now memory-hot
    const removed = await BoundedCacheHandler.invalidateKeys([
      "/movie/157336/interstellar",
      "/never-cached",
    ]);
    expect(removed).toBe(1);
    expect(await handler.get("/movie/157336/interstellar")).toBeNull();
    expect(await handler.get("/movie/2/keep")).not.toBeNull();
  });

  it("revalidateTag also marks Next's own tags manifest (immediate, any tag shape)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tagsManifest } = require("next/dist/server/lib/incremental-cache/tags-manifest.external");
    const handler = makeHandler();
    await handler.revalidateTag(["_N_T_/u/someone", "custom:tag"]);
    expect(tagsManifest.get("_N_T_/u/someone")?.expired).toBeGreaterThan(0);
    expect(tagsManifest.get("custom:tag")?.expired).toBeGreaterThan(0);
  });

  it("is reachable through the process-wide registry and never throws", async () => {
    const reg = (globalThis as Record<symbol, unknown>)[
      Symbol.for("movie-browser.bounded-isr")
    ] as { invalidateKeys: (k: unknown) => Promise<number> };
    expect(typeof reg.invalidateKeys).toBe("function");
    await expect(reg.invalidateKeys([null, 42, ""])).resolves.toBe(0);
  });
});

describe("revalidateTag on a large index (prod: ~300k entries / ~24GB)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsp: typeof import("fs/promises") = require("fs/promises");
  const N = 5000;

  /** Write N gzipped entries straight to disk, then boot a fresh handler (all tags unknown). */
  async function bootWithLargeIndex(): Promise<HandlerInstance> {
    const dir = path.join(tmpDir, "cache", "bounded-isr", "dev");
    fs.mkdirSync(dir, { recursive: true });
    const zlib = await import("zlib");
    const crypto = await import("crypto");
    const payload = zlib.gzipSync(
      JSON.stringify({ lastModified: 1, tags: ["tmdb:x"], value: { kind: "FETCH", data: "x" } }),
    );
    for (let i = 0; i < N; i++) {
      const hash = crypto.createHash("sha1").update(`/movie/${i}/t`).digest("hex");
      fs.writeFileSync(path.join(dir, `${hash}.json`), payload);
    }
    BoundedCacheHandler._clearStores();
    const handler = makeHandler();
    await handler.store.ready;
    return handler;
  }

  it("an exact-path tag (revalidatePath) reads ZERO entry files — no index scan", { timeout: 30_000 }, async () => {
    const handler = await bootWithLargeIndex();
    const spy = vi.spyOn(fsp, "readFile");
    try {
      await handler.revalidateTag(["_N_T_/movie/1/x"]);
      await handler.store.scan;
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("revalidatePath(exact path) deletes that entry durably without a scan", { timeout: 30_000 }, async () => {
    const handler = await bootWithLargeIndex();
    await handler.revalidateTag(["_N_T_/movie/7/t"]);
    BoundedCacheHandler._clearStores();
    expect(await makeHandler().get("/movie/7/t")).toBeNull();
    expect(await makeHandler().get("/movie/8/t")).not.toBeNull();
  });

  it("the fallback scan never has more than SCAN_CONCURRENCY reads in flight", async () => {
    const handler = await bootWithLargeIndex();
    const limit: number = BoundedCacheHandler._internals.SCAN_CONCURRENCY ?? 32;
    const real = fsp.readFile.bind(fsp);
    let inFlight = 0;
    let maxInFlight = 0;
    const spy = vi.spyOn(fsp, "readFile").mockImplementation((async (...args: unknown[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, 0));
        return await (real as (...a: unknown[]) => Promise<Buffer>)(...args);
      } finally {
        inFlight--;
      }
    }) as typeof fsp.readFile);
    try {
      await handler.revalidateTag(["tmdb:x"]);
      await handler.store.scan;
      expect(spy.mock.calls.length).toBe(N);
      expect(maxInFlight).toBeLessThanOrEqual(limit);
    } finally {
      spy.mockRestore();
    }
    expect(await handler.get("/movie/1/t")).toBeNull(); // the scan still did its job
  }, 30_000);
});
