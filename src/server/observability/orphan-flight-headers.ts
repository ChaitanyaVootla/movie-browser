/**
 * Orphan flight headers: a router-prefetch header WITHOUT the `RSC` header
 * makes Next render a page that can never finish.
 *
 * WHY (Nov 24 2026): the render deadline kept firing on the same URLs
 * (`/series/306391/discuss/s1e13..15` + `/discussions` ~60 times in 3 days,
 * `/series/197604/…`, a few person pages) with `pending: []`, and with
 * `startedOps` equal to exactly the Prisma calls of `generateMetadata`. The
 * page body never ran. Next 16.1.0 explains it:
 *
 * 1. `base-server` treats a request as RSC only when it carries `RSC: 1`. A
 *    request with `Next-Router-Prefetch: 1` but no `RSC` header is a normal
 *    HTML request, so the app-page handler does NOT strip the flight headers
 *    (it does that only for RSC requests to static pages) and renders it as an
 *    ISR entry under the plain path.
 * 2. `app-render` `parseRequestHeaders` reads `Next-Router-Prefetch` straight
 *    from the headers, so the render runs with `isPrefetch: true`.
 *    `create-component-tree` then stops at the first loading.tsx (series) or,
 *    when the tree has none (person), skips the page segment entirely:
 *    `generateMetadata` runs, the page component never does.
 * 3. The HTML render's `InnerLayoutRouter` finds `rsc === null` for that
 *    segment and does `use(unresolvedThenable)`. An ISR render waits for every
 *    Suspense boundary, so it never settles. Next's ResponseCache then parks
 *    every later request for the URL on it (see render-deadline.ts).
 *
 * How such a request reaches us: the proxy 308s a non-canonical detail URL.
 * Next strips `_rsc` from the URL middleware sees and does not put it back on
 * a redirect, so a client prefetch that hits the 308 follows it without
 * `_rsc`. Cloudflare's Transform Rule removes the `rsc` header when `_rsc` is
 * absent (the cache-poisoning fix in cdn.md) but leaves the other router
 * headers. Person URLs get the same shape from `permanentRedirect()` in
 * generateMetadata. Bots replaying captured headers can send it directly.
 *
 * The fix is what Next itself does for static RSC requests: drop the flight
 * headers, so the request renders (and caches) the full HTML page that a plain
 * GET of the URL would get. Without `RSC`, nothing downstream wanted a flight
 * response anyway.
 */
import type { RequestShape } from "@/lib/render-context";

/** Next's FLIGHT_HEADERS (next/dist/client/components/app-router-headers), lower-cased. */
export const RSC_HEADER = "rsc";
export const ORPHAN_FLIGHT_HEADERS = [
  "next-router-prefetch",
  "next-router-state-tree",
  "next-router-segment-prefetch",
  "next-hmr-refresh",
] as const;

type HeaderBag = Record<string, string | string[] | undefined>;

function isHeaderBag(value: unknown): value is HeaderBag {
  return typeof value === "object" && value !== null;
}

/**
 * If `headers` carries router flight headers but no `RSC` header, delete them
 * in place and return the names removed. Returns null when there was nothing
 * to do (an RSC request, or a plain request).
 */
export function stripOrphanFlightHeaders(headers: unknown): string[] | null {
  if (!isHeaderBag(headers)) return null;
  if (headers[RSC_HEADER] !== undefined) return null;
  const removed: string[] = [];
  for (const name of ORPHAN_FLIGHT_HEADERS) {
    if (headers[name] !== undefined) {
      delete headers[name];
      removed.push(name);
    }
  }
  return removed.length > 0 ? removed : null;
}

function headerValue(headers: HeaderBag, name: string): string | null {
  const value = headers[name];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(",") : value;
}

export function describeRequestShape(headers: unknown): RequestShape | null {
  if (!isHeaderBag(headers)) return null;
  return {
    rsc: headers[RSC_HEADER] !== undefined,
    prefetch: headerValue(headers, "next-router-prefetch"),
    stateTree: headers["next-router-state-tree"] !== undefined,
    segmentPrefetch: headers["next-router-segment-prefetch"] !== undefined,
  };
}

export interface OrphanFlightHeadersInfo {
  cacheKey: string | null;
  removed: string[];
  secFetchMode: string | null;
  userAgent: string | null;
}

interface HandleResponseArgs {
  cacheKey?: unknown;
  req?: { headers?: unknown };
}

const PATCHED = Symbol.for("movie-browser.orphan-flight-headers");

/**
 * Patch `handleResponse` on Next's app-page route module so orphan flight
 * headers are removed before the render reads them. `handleResponse` receives
 * the same IncomingMessage that the render later wraps, and app-render parses
 * the headers inside the response generator, so deleting them here is in time.
 * Returns false if already patched or if there is nothing to patch.
 */
export function installOrphanFlightHeaderStrip(
  proto: object,
  onStrip?: (info: OrphanFlightHeadersInfo) => void
): boolean {
  const target = proto as Record<string | symbol, unknown>;
  const original = target.handleResponse;
  if (typeof original !== "function") return false;
  if ((original as unknown as Record<symbol, unknown>)[PATCHED]) return false;
  const originalFn = original as (this: unknown, args: unknown) => unknown;

  const patched = function (this: unknown, args: unknown) {
    if (typeof args === "object" && args !== null) {
      const { req, cacheKey } = args as HandleResponseArgs;
      const headers = req?.headers;
      const removed = stripOrphanFlightHeaders(headers);
      if (removed && onStrip && isHeaderBag(headers)) {
        try {
          onStrip({
            cacheKey: typeof cacheKey === "string" ? cacheKey : null,
            removed,
            secFetchMode: headerValue(headers, "sec-fetch-mode"),
            userAgent: headerValue(headers, "user-agent")?.slice(0, 160) ?? null,
          });
        } catch {
          // Observability only.
        }
      }
    }
    return originalFn.call(this, args);
  };
  (patched as unknown as Record<symbol, unknown>)[PATCHED] = true;
  Object.defineProperty(proto, "handleResponse", {
    value: patched,
    writable: true,
    configurable: true,
  });
  return true;
}
