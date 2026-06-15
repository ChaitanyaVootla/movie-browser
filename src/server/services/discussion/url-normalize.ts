import { createHash } from "node:crypto";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Normalize a URL for stable hashing: enforce http(s), lowercase host, drop the
 * default port and the fragment, sort nothing else (path/query preserved). Returns
 * null for non-http(s) schemes or unparseable input.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_SCHEMES.has(u.protocol)) return null;
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  // toString() re-appends a trailing "/" only when there is no path; leave as-is.
  return u.toString();
}

/** Stable sha256 hex of an arbitrary string (the normalized URL). */
export function urlHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

// Matches bare http(s) URLs in a comment body. Trailing punctuation handled by URL().
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** First normalized http(s) URL in a body, or null. */
export function extractFirstLink(body: string): string | null {
  const matches = body.match(URL_RE);
  if (!matches) return null;
  for (const candidate of matches) {
    const normalized = normalizeUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract a YouTube video id (watch?v= / youtu.be/ / /embed/), else null. */
export function parseYouTubeId(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return null;
  if (u.hostname.toLowerCase() === "youtu.be") {
    const id = u.pathname.slice(1);
    return YT_ID_RE.test(id) ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && YT_ID_RE.test(v)) return v;
  const embedMatch = /^\/embed\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
  return embedMatch ? embedMatch[1] : null;
}
