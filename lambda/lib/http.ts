import { SourceError } from "./result";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Wikidata asks API clients to identify themselves (their UA policy). */
export const BOT_UA = "TheMovieBrowser/2.0 (https://themoviebrowser.com; enrichment)";

export const DEFAULT_TIMEOUT_MS = 7000;

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  /** Use the identifying bot UA instead of a browser UA. */
  botUa?: boolean;
}

export interface FetchedText {
  status: number;
  body: string;
  /** Final URL after redirects. */
  url: string;
}

/**
 * Markers of a bot wall served with a 2xx. These are what turned IMDb into a
 * silent 100% failure: its WAF answers datacenter IPs with `202` and an empty
 * body, which `response.ok` happily accepts.
 */
const CHALLENGE_MARKERS = [
  "awswaf",
  "challenge-platform",
  "cf-chl-",
  "<title>Just a moment...</title>",
  "captcha",
  "Access Denied",
];

export function looksLikeChallenge(status: number, body: string): boolean {
  if (status === 202 && body.trim().length === 0) return true;
  if (body.length > 20000) return false; // real pages are big; walls are small
  const head = body.slice(0, 20000);
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

/**
 * GET/POST a URL and return its text, mapping every failure mode onto a
 * SourceError with the right status. Callers only ever see a usable 2xx body
 * or a classified error — never a "successful" empty page.
 */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": opts.botUa ? BOT_UA : BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...opts.headers,
      },
    });
  } catch (error: unknown) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceError("timeout", `timeout after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, undefined, url);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new SourceError("error", `network: ${message}`, undefined, url);
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new SourceError(aborted ? "timeout" : "error", "failed reading body", response.status, url);
  } finally {
    clearTimeout(timer);
  }

  const status = response.status;
  if (status === 404 || status === 410) {
    throw new SourceError("not_found", `HTTP ${status}`, status, response.url || url);
  }
  if (status === 403 || status === 429 || status === 503) {
    throw new SourceError("blocked", `HTTP ${status}`, status, response.url || url);
  }
  if (status < 200 || status >= 300) {
    throw new SourceError("http_error", `HTTP ${status}`, status, response.url || url);
  }
  if (looksLikeChallenge(status, body)) {
    throw new SourceError("blocked", `bot challenge (HTTP ${status}, ${body.length}B)`, status, response.url || url);
  }
  return { status, body, url: response.url || url };
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchText(url, {
    ...opts,
    headers: { Accept: "application/json", ...opts.headers },
  });
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new SourceError("parse_error", "response was not JSON", res.status, res.url);
  }
}

/**
 * Extract every `application/ld+json` block from a page. Letterboxd wraps
 * its JSON-LD in `/* <![CDATA[ *\/ … /* ]]> *\/`, so strip that first.
 */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, "")
      .replace(/\/\*\s*\]\]>\s*\*\//g, "")
      .trim();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore malformed blocks; callers decide whether "nothing parsed" is a parse_error
    }
  }
  return out;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
