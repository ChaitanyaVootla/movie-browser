// @vitest-environment node
/**
 * The render deadline, exercised against the REAL Next runtime installed in
 * node_modules (the same `app-page-turbo.runtime.prod.js` the production page
 * chunks require), not a re-implementation of its Batcher.
 *
 * WHY: on an ISR route one render that never settles parks every later request
 * for that URL on it, for the life of the process (Oct 18 + Oct 29 2026: ~150
 * URLs wedged in an 11-day-old process, each a permanent Cloudflare 524). The
 * first describe pins that behaviour of Next itself; the rest pin the fix.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRenderContext, runInRenderContext, trackPending } from "@/lib/render-context";
import {
  APP_PAGE_RUNTIME_MODULE,
  RenderDeadlineError,
  installRenderDeadline,
  resolveRenderDeadlineMs,
  subscribeOutboundFetchTracking,
  type RenderDeadlineReport,
} from "./render-deadline";

interface RuntimeModule {
  AppPageRouteModule: { prototype: object };
}

const requireFromApp = createRequire(join(process.cwd(), "package.json"));
const runtime = requireFromApp(APP_PAGE_RUNTIME_MODULE) as RuntimeModule;

type Generator = (args: Record<string, unknown>) => Promise<unknown>;

interface HandleResponseHost {
  handleResponse(args: Record<string, unknown>): Promise<unknown>;
}

/** A fresh prototype per test, so patches never leak between tests. */
function freshPrototype(): object {
  return Object.create(runtime.AppPageRouteModule.prototype) as object;
}

/** A route module instance whose ResponseCache is Next's real one. */
function makeModule(proto: object): HandleResponseHost {
  const mod = Object.create(proto) as HandleResponseHost & Record<string, unknown>;
  const incrementalCache = { get: async () => null, set: async () => undefined };
  mod.getIncrementalCache = async () => incrementalCache;
  return mod;
}

function request(mod: HandleResponseHost, cacheKey: string | null, responseGenerator: Generator) {
  return mod.handleResponse({
    req: { headers: {} },
    nextConfig: {},
    cacheKey,
    routeKind: "APP_PAGE",
    isFallback: false,
    prerenderManifest: {},
    isRoutePPREnabled: false,
    isOnDemandRevalidate: false,
    revalidateOnlyGenerated: false,
    responseGenerator,
    waitUntil: undefined,
    isMinimalMode: false,
  });
}

const never: Generator = () => new Promise(() => {});
const okEntry = { value: { kind: "REDIRECT", props: { ok: true } }, cacheControl: undefined };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Settles to "pending" if the promise has not settled within `ms`. */
async function stateAfter(promise: Promise<unknown>, ms: number): Promise<string> {
  return Promise.race([
    promise.then(
      () => "resolved",
      (e: unknown) => (e instanceof RenderDeadlineError ? "deadline" : "rejected")
    ),
    sleep(ms).then(() => "pending"),
  ]);
}

describe("Next's ResponseCache without a deadline (the wedge)", () => {
  it("parks a second request for the same URL on a render that never settles", async () => {
    const mod = makeModule(freshPrototype());
    void request(mod, "/movie/1/wedged", never);
    await sleep(20);

    const second = vi.fn(async () => okEntry);
    const p = request(mod, "/movie/1/wedged", second);

    expect(await stateAfter(p, 150)).toBe("pending");
    expect(second).not.toHaveBeenCalled();
  });
});

describe("installRenderDeadline", () => {
  it("rejects a never-settling render at the deadline, then the next request renders afresh", async () => {
    const proto = freshPrototype();
    const reports: RenderDeadlineReport[] = [];
    installRenderDeadline(proto, { timeoutMs: 60, onDeadline: (r) => reports.push(r) });
    const mod = makeModule(proto);

    const first = request(mod, "/movie/2/hangs", never);
    expect(await stateAfter(first, 300)).toBe("deadline");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ cacheKey: "/movie/2/hangs", timeoutMs: 60 });

    const second = vi.fn(async () => okEntry);
    expect(await stateAfter(request(mod, "/movie/2/hangs", second), 300)).toBe("resolved");
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("names what the render was still waiting on", async () => {
    const proto = freshPrototype();
    const reports: RenderDeadlineReport[] = [];
    installRenderDeadline(proto, { timeoutMs: 60, onDeadline: (r) => reports.push(r) });
    const mod = makeModule(proto);

    const render: Generator = async () => {
      await trackPending("movie.findUnique", Promise.resolve(1));
      await trackPending("cache:movie:/movie/3", new Promise(() => {}));
      return okEntry;
    };
    expect(await stateAfter(request(mod, "/movie/3/x", render), 300)).toBe("deadline");

    expect(reports[0].pending.map((p) => p.label)).toEqual(["cache:movie:/movie/3"]);
    expect(reports[0].lastSettled?.label).toBe("movie.findUnique");
    expect(reports[0].startedOps).toBe(2);
    expect(reports[0].settledOps).toBe(1);
  });

  it("leaves a render that finishes in time untouched", async () => {
    const proto = freshPrototype();
    const onDeadline = vi.fn();
    installRenderDeadline(proto, { timeoutMs: 200, onDeadline });
    const mod = makeModule(proto);

    const render = vi.fn(async () => {
      await sleep(10);
      return okEntry;
    });
    expect(await stateAfter(request(mod, "/movie/4/fast", render), 400)).toBe("resolved");
    await sleep(250);
    expect(onDeadline).not.toHaveBeenCalled();
  });

  it("reports a render that eventually settles after its deadline", async () => {
    const proto = freshPrototype();
    const late = vi.fn();
    installRenderDeadline(proto, { timeoutMs: 40, onSettledAfterDeadline: late });
    const mod = makeModule(proto);

    const render: Generator = async () => {
      await sleep(120);
      return okEntry;
    };
    expect(await stateAfter(request(mod, "/movie/5/slow", render), 300)).toBe("deadline");
    await sleep(150);
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0][0]).toMatchObject({ cacheKey: "/movie/5/slow" });
  });

  it("counts abandoned renders until they settle", async () => {
    const proto = freshPrototype();
    const reports: RenderDeadlineReport[] = [];
    installRenderDeadline(proto, { timeoutMs: 40, onDeadline: (r) => reports.push(r) });
    const mod = makeModule(proto);

    const late: Generator = async () => {
      await sleep(100);
      return okEntry;
    };
    expect(await stateAfter(request(mod, "/movie/8/late", late), 300)).toBe("deadline");
    await sleep(120); // the abandoned render settles
    expect(await stateAfter(request(mod, "/movie/8/never", never), 300)).toBe("deadline");

    // Other tests leave never-settling renders behind, so compare, don't pin.
    expect(reports[1].abandonedOutstanding).toBe(reports[0].abandonedOutstanding);
  });

  it("still releases the URL when the deadline reporter throws", async () => {
    const proto = freshPrototype();
    installRenderDeadline(proto, {
      timeoutMs: 40,
      onDeadline: () => {
        throw new Error("logger down");
      },
    });
    const mod = makeModule(proto);
    expect(await stateAfter(request(mod, "/movie/9/x", never), 300)).toBe("deadline");
  });

  it("does not touch uncacheable (keyless) renders, which nothing can park on", async () => {
    const proto = freshPrototype();
    installRenderDeadline(proto, { timeoutMs: 30 });
    const mod = makeModule(proto);
    expect(await stateAfter(request(mod, null, never), 150)).toBe("pending");
  });

  it("is idempotent", async () => {
    const proto = freshPrototype();
    const onDeadline = vi.fn();
    expect(installRenderDeadline(proto, { timeoutMs: 40, onDeadline })).toBe(true);
    expect(installRenderDeadline(proto, { timeoutMs: 40, onDeadline })).toBe(false);
    const mod = makeModule(proto);
    expect(await stateAfter(request(mod, "/movie/6/x", never), 300)).toBe("deadline");
    expect(onDeadline).toHaveBeenCalledTimes(1);
  });
});

describe("the installed Next runtime still has the shape we patch", () => {
  // If a Next upgrade renames or reshapes this, the deadline silently stops
  // applying. Fail here instead.
  it("exposes AppPageRouteModule with handleResponse({ cacheKey, responseGenerator })", () => {
    const proto = runtime.AppPageRouteModule.prototype as Record<string, unknown>;
    const handleResponse = proto.handleResponse;
    expect(typeof handleResponse).toBe("function");
    const source = String(handleResponse);
    expect(source).toContain("cacheKey");
    expect(source).toContain("responseGenerator");
  });
});

describe("resolveRenderDeadlineMs", () => {
  it("defaults, honours a valid override, and treats 0 as disabled", () => {
    expect(resolveRenderDeadlineMs(undefined)).toBe(90_000);
    expect(resolveRenderDeadlineMs("")).toBe(90_000);
    expect(resolveRenderDeadlineMs("45000")).toBe(45_000);
    expect(resolveRenderDeadlineMs("0")).toBe(0);
    expect(resolveRenderDeadlineMs("abc")).toBe(90_000);
    expect(resolveRenderDeadlineMs("-5")).toBe(90_000);
  });
});

describe("subscribeOutboundFetchTracking", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    // Accepts the request and never answers.
    server = createServer(() => {});
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    subscribeOutboundFetchTracking();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("registers an outbound fetch as pending in the render that made it, without its query string", async () => {
    const ctx = createRenderContext("/movie/7/x");
    const controller = new AbortController();
    runInRenderContext(ctx, () => {
      void fetch(`http://127.0.0.1:${port}/3/movie/7?api_key=secret`, {
        signal: controller.signal,
      }).catch(() => undefined);
    });
    await sleep(100);

    const labels = [...ctx.pending].map((p) => p.label);
    expect(labels).toEqual([`fetch GET http://127.0.0.1:${port}/3/movie/7`]);

    controller.abort();
    await sleep(50);
    expect(ctx.pending.size).toBe(0);
  });
});
