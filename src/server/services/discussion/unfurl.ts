import { dataLogger } from "@/lib/logger";
import {
  getUnfurl,
  upsertUnfurl,
  type LinkUnfurlDto,
  type UpsertUnfurlInput,
} from "@/server/db/postgres/social/link-unfurls";
import { parseOgMeta } from "./og-parse";
import { assertPublicAddresses } from "./ssrf-guard";
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
 * Real network fetch with the SSRF discipline applied AT EACH redirect hop:
 * manual redirects, 2s budget across the whole chain, re-resolve+re-gate each
 * Location, body-size cap. Used by the default deps in enqueueUnfurl.
 */
async function fetchTextHardened(
  startUrl: string
): Promise<{ ok: true; finalUrl: string; html: string } | { ok: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hostname = new URL(current).hostname;
      if (!(await assertPublicAddresses(hostname))) return { ok: false };
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
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
      // Cap the body: read up to MAX_BODY_BYTES then stop.
      const buf = await res.arrayBuffer();
      const slice = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
      const html = new TextDecoder("utf-8").decode(slice);
      return { ok: true, finalUrl: current, html };
    }
    return { ok: false }; // too many redirects
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

const defaultDeps: UnfurlDeps = {
  assertPublic: (hostname) => assertPublicAddresses(hostname),
  fetchText: fetchTextHardened,
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
