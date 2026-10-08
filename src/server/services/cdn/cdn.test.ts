/**
 * Title purge pipeline: URL building, rate-limited batching, Cloudflare
 * client safety, and the hydration gating helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/analytics/track", () => ({ trackAPICall: vi.fn() }));

import { trackAPICall } from "@/lib/analytics/track";
import { edgeTargets, originIsrKeys, titleKey } from "./paths";
import { PurgeQueue } from "./purge-queue";
import { getCloudflarePurgeConfig, isSafePrefix, purgeCloudflare } from "./cloudflare";
import { invalidateOriginIsr } from "./origin-isr";
import type { TitleRef } from "./paths";

const SITE = "https://themoviebrowser.com";
const interstellar: TitleRef = { mediaType: "movie", id: 157336, title: "Interstellar" };

describe("paths", () => {
  it("origin key = canonical getMediaPath (what the proxy canonicalizes to)", () => {
    expect(originIsrKeys(interstellar)).toEqual(["/movie/157336/interstellar"]);
    expect(originIsrKeys({ mediaType: "series", id: 1399, title: "Game of Thrones" })).toEqual([
      "/series/1399/game-of-thrones",
    ]);
  });

  it("edge targets: page + .md files, prefix for ?_rsc= variants", () => {
    expect(edgeTargets(interstellar, SITE + "/")).toEqual({
      files: [
        "https://themoviebrowser.com/movie/157336/interstellar",
        "https://themoviebrowser.com/movie/157336/interstellar.md",
      ],
      prefixes: ["themoviebrowser.com/movie/157336/interstellar"],
    });
  });

  it("slugless titles get files only — a bare /movie/12 prefix would over-match /movie/123…", () => {
    const t = edgeTargets({ mediaType: "movie", id: 12, title: "東京物語" }, SITE);
    expect(t.files).toEqual([`${SITE}/movie/12`, `${SITE}/movie/12.md`]);
    expect(t.prefixes).toEqual([]);
  });

  it("titleKey dedupes per media type + id", () => {
    expect(titleKey(interstellar)).toBe("movie:157336");
  });
});

describe("isSafePrefix (never a host-wide purge)", () => {
  it.each([
    ["themoviebrowser.com/movie/157336/interstellar", true],
    ["themoviebrowser.com/series/1399/game-of-thrones", true],
    ["themoviebrowser.com", false],
    ["themoviebrowser.com/", false],
    ["themoviebrowser.com/movie", false],
    ["themoviebrowser.com/movie/157336", false],
    ["themoviebrowser.com/person/1/x", false],
  ])("%s → %s", (prefix, ok) => {
    expect(isSafePrefix(prefix)).toBe(ok);
  });
});

describe("PurgeQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ref = (id: number): TitleRef => ({ mediaType: "movie", id, title: `T ${id}` });

  it("a single change on a quiet site is sent after the debounce, deduped by title", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = new PurgeQueue({ send, debounceMs: 3000 });
    q.enqueue(ref(1));
    q.enqueue(ref(1));
    q.enqueue(ref(2));
    await vi.advanceTimersByTimeAsync(2999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map((r: TitleRef) => r.id)).toEqual([1, 2]);
  });

  it("respects the token bucket: bursts beyond capacity wait for refill, then batch", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = new PurgeQueue({ send, debounceMs: 1000, bucketCapacity: 2, refillMs: 20_000 });
    for (let round = 0; round < 4; round++) {
      q.enqueue(ref(100 + round));
      await vi.advanceTimersByTimeAsync(1000);
    }
    // 2 tokens → 2 calls; rounds 3 and 4 are coalesced while waiting.
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0].map((r: TitleRef) => r.id)).toEqual([102, 103]);
  });

  it("never exceeds the configured rate over a sustained storm", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = new PurgeQueue({ send, debounceMs: 500, bucketCapacity: 3, refillMs: 20_000 });
    let id = 1;
    for (let t = 0; t < 10 * 60; t++) {
      q.enqueue(ref(id++)); // one change/second for 10 minutes
      await vi.advanceTimersByTimeAsync(1000);
    }
    // ≤ capacity + minutes*3 calls (3/min), i.e. well under Cloudflare's 5/min.
    expect(send.mock.calls.length).toBeLessThanOrEqual(3 + 30);
    const sentTitles = send.mock.calls.reduce((n, c) => n + c[0].length, 0);
    expect(sentTitles + q.getStats().pending).toBe(600); // nothing lost
  });

  it("batches are capped at maxBatch titles (100-item API cap with 2 files/title)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = new PurgeQueue({ send, debounceMs: 10 });
    for (let i = 1; i <= 120; i++) q.enqueue(ref(i));
    await vi.advanceTimersByTimeAsync(10);
    expect(send.mock.calls[0][0]).toHaveLength(50);
  });

  it("caps pending titles and counts drops", () => {
    const q = new PurgeQueue({ send: vi.fn(), maxPending: 3 });
    expect([1, 2, 3, 4].map((i) => q.enqueue(ref(i)))).toEqual([true, true, true, false]);
    expect(q.enqueue(ref(1))).toBe(true); // re-enqueue of a pending title is not a drop
    expect(q.getStats()).toMatchObject({ pending: 3, dropped: 1 });
  });

  it("a throwing sender does not wedge the queue", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const q = new PurgeQueue({ send, debounceMs: 10, refillMs: 100 });
    q.enqueue(ref(1));
    await vi.advanceTimersByTimeAsync(10);
    q.enqueue(ref(2));
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("cloudflare client", () => {
  it("config: dedicated purge token preferred; kill switch; unset = null", () => {
    expect(getCloudflarePurgeConfig({})).toBeNull();
    expect(getCloudflarePurgeConfig({ CLOUDFLARE_ZONE_ID: "z" })).toBeNull();
    expect(
      getCloudflarePurgeConfig({ CLOUDFLARE_ZONE_ID: "z", CLOUDFLARE_API_TOKEN: "a", CLOUDFLARE_PURGE_TOKEN: "p" }),
    ).toEqual({ zoneId: "z", token: "p" });
    expect(getCloudflarePurgeConfig({ CLOUDFLARE_ZONE_ID: "z", CLOUDFLARE_API_TOKEN: "a" })).toEqual({
      zoneId: "z",
      token: "a",
    });
    expect(
      getCloudflarePurgeConfig({ CLOUDFLARE_ZONE_ID: "z", CLOUDFLARE_API_TOKEN: "a", CDN_EDGE_PURGE: "off" }),
    ).toBeNull();
  });

  it("sends files and prefixes as separate calls, drops unsafe prefixes, tracks each", async () => {
    vi.mocked(trackAPICall).mockClear();
    const fetchImpl = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 }),
    );
    const res = await purgeCloudflare(
      { zoneId: "zone1", token: "tok" },
      { files: ["https://x/movie/1/a"], prefixes: ["x/movie/1/a", "x"] },
      fetchImpl,
    );
    expect(res.files?.ok).toBe(true);
    expect(res.prefixes?.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies).toEqual([{ files: ["https://x/movie/1/a"] }, { prefixes: ["x/movie/1/a"] }]);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone1/purge_cache",
    );
    expect(trackAPICall).toHaveBeenCalledWith(
      expect.objectContaining({ service: "cdn_purge", endpoint: "cloudflare:files", errorType: null }),
    );
  });

  it("an auth failure (token lacks Cache Purge) is reported + tracked, never thrown", async () => {
    vi.mocked(trackAPICall).mockClear();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }),
        { status: 403 },
      ),
    );
    const res = await purgeCloudflare({ zoneId: "z", token: "t" }, { files: ["https://x/a"], prefixes: [] }, fetchImpl);
    expect(res.files).toMatchObject({ ok: false, errorCode: 10000 });
    expect(res.prefixes).toBeNull();
    expect(trackAPICall).toHaveBeenCalledWith(expect.objectContaining({ errorType: "cf_10000" }));
  });

  it("network errors resolve to ok:false", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const res = await purgeCloudflare({ zoneId: "z", token: "t" }, { files: ["https://x/a"], prefixes: [] }, fetchImpl);
    expect(res.files).toMatchObject({ ok: false, status: 0, errorMessage: "ECONNRESET" });
  });
});

describe("origin ISR invalidation", () => {
  const REG = Symbol.for("movie-browser.bounded-isr");
  const g = globalThis as Record<symbol, unknown>;
  let saved: unknown;
  beforeEach(() => {
    saved = g[REG];
  });
  afterEach(() => {
    g[REG] = saved;
    delete process.env.ORIGIN_ISR_INVALIDATE;
  });

  it("delegates to the cache-handler registry", async () => {
    const invalidateKeys = vi.fn().mockResolvedValue(1);
    g[REG] = { invalidateKeys };
    await expect(invalidateOriginIsr(["/movie/1/a"])).resolves.toBe(1);
    expect(invalidateKeys).toHaveBeenCalledWith(["/movie/1/a"]);
  });

  it("no registry / kill switch / throwing registry = 0, never throws", async () => {
    g[REG] = undefined;
    await expect(invalidateOriginIsr(["/a"])).resolves.toBe(0);
    g[REG] = { invalidateKeys: vi.fn().mockRejectedValue(new Error("x")) };
    await expect(invalidateOriginIsr(["/a"])).resolves.toBe(0);
    const invalidateKeys = vi.fn();
    g[REG] = { invalidateKeys };
    process.env.ORIGIN_ISR_INVALIDATE = "off";
    await expect(invalidateOriginIsr(["/a"])).resolves.toBe(0);
    expect(invalidateKeys).not.toHaveBeenCalled();
  });
});

describe("notifyIfContentChanged (hydration gate)", () => {
  it("only a committed, displayed change reaches the pipeline", async () => {
    const invalidateKeys = vi.fn().mockResolvedValue(0);
    const g = globalThis as Record<symbol, unknown>;
    const REG = Symbol.for("movie-browser.bounded-isr");
    const saved = g[REG];
    g[REG] = { invalidateKeys };
    try {
      const { notifyIfContentChanged } = await import("./index");
      notifyIfContentChanged(undefined, "movie", 1, "A");
      notifyIfContentChanged({ contentChanged: false }, "movie", 1, "A");
      expect(invalidateKeys).not.toHaveBeenCalled();
      notifyIfContentChanged({ contentChanged: true }, "movie", 157336, "Interstellar");
      expect(invalidateKeys).toHaveBeenCalledWith(["/movie/157336/interstellar"]);
    } finally {
      g[REG] = saved;
    }
  });
});
