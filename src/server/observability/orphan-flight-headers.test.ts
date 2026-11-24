// @vitest-environment node
/**
 * A `Next-Router-Prefetch` header without `RSC` made Next render an ISR page
 * as a prefetch (page segment skipped) and then wait forever for the missing
 * segment in the HTML render. See orphan-flight-headers.ts for the chain.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  describeRequestShape,
  installOrphanFlightHeaderStrip,
  stripOrphanFlightHeaders,
  type OrphanFlightHeadersInfo,
} from "./orphan-flight-headers";
import {
  APP_PAGE_RUNTIME_MODULE,
  installRenderDeadline,
  type RenderDeadlineReport,
} from "./render-deadline";

describe("stripOrphanFlightHeaders", () => {
  it("removes router headers from a request that has no RSC header", () => {
    const headers: Record<string, string> = {
      "next-router-prefetch": "1",
      "next-router-state-tree": "%5B%22%22%5D",
      "next-router-segment-prefetch": "/_tree",
      "user-agent": "Mozilla/5.0",
    };
    expect(stripOrphanFlightHeaders(headers)).toEqual([
      "next-router-prefetch",
      "next-router-state-tree",
      "next-router-segment-prefetch",
    ]);
    expect(headers).toEqual({ "user-agent": "Mozilla/5.0" });
  });

  it("leaves a real RSC request alone (Next strips those itself for static pages)", () => {
    const headers = { rsc: "1", "next-router-prefetch": "1", "next-router-state-tree": "x" };
    expect(stripOrphanFlightHeaders(headers)).toBeNull();
    expect(headers).toEqual({ rsc: "1", "next-router-prefetch": "1", "next-router-state-tree": "x" });
  });

  it("is a no-op for a plain page request and for junk input", () => {
    const headers = { accept: "text/html" };
    expect(stripOrphanFlightHeaders(headers)).toBeNull();
    expect(headers).toEqual({ accept: "text/html" });
    expect(stripOrphanFlightHeaders(undefined)).toBeNull();
    expect(stripOrphanFlightHeaders("x")).toBeNull();
  });
});

describe("describeRequestShape", () => {
  it("summarises the router headers without their values (except prefetch)", () => {
    expect(
      describeRequestShape({ "next-router-prefetch": "1", "next-router-state-tree": "big" })
    ).toEqual({ rsc: false, prefetch: "1", stateTree: true, segmentPrefetch: false });
    expect(describeRequestShape({ rsc: "1" })).toEqual({
      rsc: true,
      prefetch: null,
      stateTree: false,
      segmentPrefetch: false,
    });
    expect(describeRequestShape(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Against the real Next runtime's handleResponse (same harness as
// render-deadline.test.ts)
// ---------------------------------------------------------------------------

interface RuntimeModule {
  AppPageRouteModule: { prototype: object };
}

const requireFromApp = createRequire(join(process.cwd(), "package.json"));
const runtime = requireFromApp(APP_PAGE_RUNTIME_MODULE) as RuntimeModule;

interface HandleResponseHost {
  handleResponse(args: Record<string, unknown>): Promise<unknown>;
}

function makeModule(proto: object): HandleResponseHost {
  const mod = Object.create(proto) as HandleResponseHost & Record<string, unknown>;
  const incrementalCache = { get: async () => null, set: async () => undefined };
  mod.getIncrementalCache = async () => incrementalCache;
  return mod;
}

const okEntry = { value: { kind: "REDIRECT", props: { ok: true } }, cacheControl: undefined };

function request(
  mod: HandleResponseHost,
  cacheKey: string,
  headers: Record<string, string>,
  responseGenerator: () => Promise<unknown>
) {
  return mod.handleResponse({
    req: { headers },
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

describe("installOrphanFlightHeaderStrip", () => {
  it("strips the headers before the render reads them, and reports it", async () => {
    const proto = Object.create(runtime.AppPageRouteModule.prototype) as object;
    const seen: OrphanFlightHeadersInfo[] = [];
    expect(installOrphanFlightHeaderStrip(proto, (info) => seen.push(info))).toBe(true);
    const mod = makeModule(proto);

    const headers: Record<string, string> = {
      "next-router-prefetch": "1",
      "next-router-state-tree": "tree",
      "sec-fetch-mode": "cors",
      "user-agent": "Mozilla/5.0 test",
    };
    let headersAtRender: Record<string, string> | null = null;
    await request(mod, "/series/306391/discuss/s1e14", headers, async () => {
      headersAtRender = { ...headers };
      return okEntry;
    });

    expect(headersAtRender).toEqual({ "sec-fetch-mode": "cors", "user-agent": "Mozilla/5.0 test" });
    expect(seen).toEqual([
      {
        cacheKey: "/series/306391/discuss/s1e14",
        removed: ["next-router-prefetch", "next-router-state-tree"],
        secFetchMode: "cors",
        userAgent: "Mozilla/5.0 test",
      },
    ]);
  });

  it("does not touch an RSC request, and never reports for it", async () => {
    const proto = Object.create(runtime.AppPageRouteModule.prototype) as object;
    const onStrip = vi.fn();
    installOrphanFlightHeaderStrip(proto, onStrip);
    const mod = makeModule(proto);
    const headers = { rsc: "1", "next-router-prefetch": "1" };
    await request(mod, "/movie/1/x", headers, async () => okEntry);
    expect(headers).toEqual({ rsc: "1", "next-router-prefetch": "1" });
    expect(onStrip).not.toHaveBeenCalled();
  });

  it("is idempotent", () => {
    const proto = Object.create(runtime.AppPageRouteModule.prototype) as object;
    expect(installOrphanFlightHeaderStrip(proto)).toBe(true);
    expect(installOrphanFlightHeaderStrip(proto)).toBe(false);
  });

  it("composes with the render deadline: the report shows the ORIGINAL request shape", async () => {
    const proto = Object.create(runtime.AppPageRouteModule.prototype) as object;
    // Production order (installAppPageRenderDeadline): strip first, deadline
    // second, so the deadline wrapper runs first and sees the raw headers.
    installOrphanFlightHeaderStrip(proto);
    const reports: RenderDeadlineReport[] = [];
    installRenderDeadline(proto, { timeoutMs: 40, onDeadline: (r) => reports.push(r) });
    const mod = makeModule(proto);

    const headers = { "next-router-prefetch": "1" };
    await request(mod, "/person/1/x", headers, () => new Promise(() => {})).catch(() => undefined);

    expect(headers).toEqual({});
    expect(reports[0]?.request).toEqual({
      rsc: false,
      prefetch: "1",
      stateTree: false,
      segmentPrefetch: false,
    });
  });
});

describe("the Next behaviour this works around (fails if an upgrade changes it)", () => {
  const nextDist = join(process.cwd(), "node_modules/next/dist");

  it("app-render derives isPrefetch from the prefetch header alone, not gated on RSC", () => {
    const src = readFileSync(join(nextDist, "server/app-render/app-render.js"), "utf8");
    expect(src).toMatch(
      /const isPrefetchRequest = headers\[_approuterheaders\.NEXT_ROUTER_PREFETCH_HEADER\] === '1';/
    );
  });

  it("a prefetch render skips the child segment at a loading boundary (or when none exists)", () => {
    const src = readFileSync(join(nextDist, "server/app-render/create-component-tree.js"), "utf8");
    expect(src).toContain("isPrefetch && (Loading || !(0, _hasloadingcomponentintree.hasLoadingComponentInTree)(parallelRoute))");
  });

  it("the HTML render suspends forever on a segment with no data", () => {
    const src = readFileSync(join(nextDist, "client/components/layout-router.js"), "utf8");
    expect(src).toMatch(/if \(rsc === null\) \{\s*\(0, _react\.use\)\(_unresolvedthenable\.unresolvedThenable\);/);
  });

  it("the app-page handler strips flight headers only for RSC requests", () => {
    const src = readFileSync(join(nextDist, "build/templates/app-page.js"), "utf8");
    expect(src).toMatch(
      /isSSG && isRSCRequest && !isDynamicRSCRequest\) \{\s*\(0, _stripflightheaders\.stripFlightHeaders\)\(req\.headers\);/
    );
  });
});
