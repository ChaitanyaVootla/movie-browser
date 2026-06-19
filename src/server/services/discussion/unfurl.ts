import { lookup as dnsLookup } from "node:dns";
import { Agent } from "undici";
import { dataLogger } from "@/lib/logger";
import {
  getUnfurl,
  upsertUnfurl,
  type LinkUnfurlDto,
  type UpsertUnfurlInput,
} from "@/server/db/postgres/social/link-unfurls";
import { parseOgMeta } from "./og-parse";
import { assertPublicAddresses, isPublicIp } from "./ssrf-guard";
import { extractFirstLink, normalizeUrl, parseYouTubeId, urlHash } from "./url-normalize";

const FETCH_TIMEOUT_MS = 2_000; // mirrors media-resolver.ts discipline
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024; // 512KB of HTML is plenty for <head> meta
const USER_AGENT = "MovieBrowserUnfurl/1.0 (+https://themoviebrowser.com)";

/** Injectable side-effects so the SSRF path is unit-testable without real network. */
export interface UnfurlDeps {
  /** Resolve host → all IPs and require all public (ssrf-guard). */
  assertPublic: (hostname: string) => Promise<boolean>;
  /** Fetch a URL, following safe redirects, returning the final URL + HTML body. */
  fetchText: (
    url: string
  ) => Promise<{ ok: true; finalUrl: string; html: string } | { ok: false }>;
}

function faviconFor(domain: string): string {
  // Single known-safe host (Google s2). NOT an arbitrary-domain hotlink.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function failedResult(normalized: string, urlHashValue: string): UpsertUnfurlInput {
  let domain = "";
  try {
    domain = new URL(normalized).hostname;
  } catch {
    domain = "";
  }
  return {
    urlHash: urlHashValue,
    url: normalized,
    domain,
    status: "FAILED",
    title: null,
    description: null,
    imageUrl: null,
    faviconUrl: null,
    provider: "GENERIC",
    youtubeId: null,
  };
}

/**
 * Build the unfurl record for a URL. SSRF-hardened, fail-open: any
 * scheme/SSRF/fetch/parse failure yields a FAILED record (the renderer shows a
 * plain safe anchor). Never throws.
 */
export async function fetchUnfurl(rawUrl: string, deps: UnfurlDeps): Promise<UpsertUnfurlInput> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    // Non-http(s) / garbage: hash the raw input so the failure is still cached.
    return failedResult(rawUrl, urlHash(rawUrl));
  }
  const hash = urlHash(normalized);

  // YouTube → no scrape; the facade renders from the id. Treat as OK immediately.
  const youtubeId = parseYouTubeId(normalized);
  if (youtubeId) {
    return {
      urlHash: hash,
      url: normalized,
      domain: new URL(normalized).hostname,
      status: "OK",
      title: null,
      description: null,
      imageUrl: null,
      faviconUrl: faviconFor(new URL(normalized).hostname),
      provider: "YOUTUBE",
      youtubeId,
    };
  }

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    return failedResult(normalized, hash);
  }

  // SSRF gate BEFORE any network egress.
  const safe = await deps.assertPublic(hostname);
  if (!safe) return failedResult(normalized, hash);

  const fetched = await deps.fetchText(normalized);
  if (!fetched.ok) return failedResult(normalized, hash);

  const meta = parseOgMeta(fetched.html);
  const finalDomain = (() => {
    try {
      return new URL(fetched.finalUrl).hostname;
    } catch {
      return hostname;
    }
  })();

  return {
    urlHash: hash,
    url: normalized,
    domain: finalDomain,
    status: "OK",
    title: meta.title,
    description: meta.description,
    // Stored for forward-compat (rung 7 image proxy) but only RENDERED for
    // allowlisted hosts — see link-card.tsx.
    imageUrl: meta.imageUrl,
    faviconUrl: faviconFor(finalDomain),
    provider: "GENERIC",
    youtubeId: null,
  };
}

/**
 * Read a response body incrementally, accumulating up to MAX_BODY_BYTES, then
 * cancel the stream (don't buffer the whole body). Returns the decoded prefix,
 * or null if the body is missing/unreadable. Fail-open: a read error → null
 * (the caller turns that into a FAILED record). Cancelling the reader aborts the
 * underlying download once we have enough <head> bytes.
 */
async function readCappedBody(res: Response, controller: AbortController): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX_BODY_BYTES) break;
      }
    }
  } catch {
    return null;
  } finally {
    // Stop the download; abort the request too so a slow/huge body can't linger.
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    controller.abort();
  }
  const merged = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    const take = Math.min(chunk.byteLength, merged.length - offset);
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * DNS-rebinding (TOCTOU) defense. `assertPublicAddresses` resolves DNS to vet a
 * host, but a plain `fetch` then RE-resolves independently — a low-TTL attacker
 * record can return a public IP to the check and a private IP to the actual
 * connection. This undici dispatcher closes that gap: its `connect.lookup` is the
 * SAME resolution `fetch` dials on, and it re-validates every returned address
 * with `isPublicIp` (fail-closed), per connection — i.e. per redirect hop, since
 * we re-fetch each Location manually. So fetch connects to a vetted IP, not a
 * re-resolved one. The per-hop `assertPublicAddresses` re-gate is kept as
 * defense-in-depth (it also blocks empty-resolution hosts before egress).
 */
function makePinnedDispatcher(): Agent {
  return new Agent({
    connect: {
      lookup(
        hostname: string,
        _opts: unknown,
        cb: (err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void
      ): void {
        dnsLookup(hostname, { all: true }, (err, addresses) => {
          if (err) {
            cb(err, []);
            return;
          }
          const list = Array.isArray(addresses) ? addresses : [];
          // Re-validate the addresses being DIALED. Any private/empty → block.
          if (list.length === 0 || !list.every((a) => isPublicIp(a.address))) {
            cb(new Error("SSRF: resolved address is not public"), []);
            return;
          }
          cb(null, list.map((a) => ({ address: a.address, family: a.family })));
        });
      },
    },
  });
}

/** Injectable fetch surface so the hardened path is unit-testable. */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Injectable hooks for the hardened fetch (tests pass a mock fetch + host gate). */
export interface HardenedFetchOpts {
  fetchImpl?: FetchLike;
  /** Per-hop host SSRF re-gate (default: real DNS-resolving assertPublicAddresses). */
  assertPublic?: (hostname: string) => Promise<boolean>;
  /** IP-pinning dispatcher; pass null to skip (tests with a mock fetch). */
  dispatcher?: Agent | null;
}

/**
 * Real network fetch with the SSRF discipline applied AT EACH redirect hop:
 * manual redirects, 2s budget across the whole chain, re-resolve+re-gate each
 * Location, an IP-pinning dispatcher (DNS-rebinding defense), body-size cap.
 * Used by the default deps in enqueueUnfurl. The opts are injectable for tests
 * (production uses global fetch + the pinned dispatcher + real host gate).
 */
export async function fetchTextHardened(
  startUrl: string,
  opts: HardenedFetchOpts = {}
): Promise<{ ok: true; finalUrl: string; html: string } | { ok: false }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const assertPublic = opts.assertPublic ?? assertPublicAddresses;
  const dispatcher = opts.dispatcher === undefined ? makePinnedDispatcher() : opts.dispatcher;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hostname = new URL(current).hostname;
      // Per-hop re-gate (defense-in-depth; the dispatcher pins the actual dial).
      if (!(await assertPublic(hostname))) return { ok: false };
      const res = await fetchImpl(current, {
        signal: controller.signal,
        redirect: "manual",
        // @ts-expect-error — `dispatcher` is an undici RequestInit extension Node's
        // global fetch honors but the DOM RequestInit type doesn't declare.
        dispatcher,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false };
        const next = normalizeUrl(new URL(location, current).toString());
        if (!next) return { ok: false };
        current = next;
        continue;
      }
      if (!res.ok) return { ok: false };
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) return { ok: false };
      // Stream the body, accumulating at most MAX_BODY_BYTES, then abort — never
      // buffer an unbounded response into memory (a hostile server can stream
      // gigabytes). The 2s AbortController still bounds total time.
      const html = await readCappedBody(res, controller);
      if (html === null) return { ok: false };
      return { ok: true, finalUrl: current, html };
    }
    return { ok: false }; // too many redirects
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
    try {
      await dispatcher?.close();
    } catch {
      /* ignore */
    }
  }
}

const defaultDeps: UnfurlDeps = {
  assertPublic: (hostname) => assertPublicAddresses(hostname),
  fetchText: (url) => fetchTextHardened(url),
};

/** Cache read for the render path (delegates to the DB layer). */
export async function getCachedUnfurl(normalized: string): Promise<LinkUnfurlDto | null> {
  return getUnfurl(urlHash(normalized));
}

/**
 * Fire-and-forget unfurl on comment submit. Idempotent: skips the fetch if the URL
 * is already cached. Swallows all errors (fail-open) — an unfurl miss only means a
 * comment renders its link as a plain anchor.
 */
export async function enqueueUnfurl(rawUrl: string, deps: UnfurlDeps = defaultDeps): Promise<void> {
  try {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;
    const existing = await getUnfurl(urlHash(normalized));
    if (existing) return; // already cached — never refetch
    const record = await fetchUnfurl(normalized, deps);
    await upsertUnfurl(record);
  } catch (error: unknown) {
    dataLogger.error(
      { action: "enqueueUnfurl", error: error instanceof Error ? error.message : String(error) },
      "enqueueUnfurl failed"
    );
  }
}

/**
 * Enqueue an unfurl for the first link in a published comment body. Bounded by
 * comment volume (one link per submit). Caller fires it fire-and-forget AFTER
 * the comment is PUBLISHED — never on a render path.
 */
export async function unfurlFirstLink(
  body: string,
  enqueue: (url: string) => Promise<void> = enqueueUnfurl
): Promise<void> {
  const link = extractFirstLink(body);
  if (!link) return;
  await enqueue(link);
}
