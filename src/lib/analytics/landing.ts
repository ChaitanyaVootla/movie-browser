/**
 * Landing attribution measured in the BROWSER.
 *
 * Why (Nov 25 2026): page views are logged by the proxy, at the origin. Cloudflare
 * serves cached HTML without touching the origin, so a visitor who lands from a
 * search engine on a cached page is never logged with that referrer; the origin
 * only sees their later client navigations, with our own site as referrer. Of the
 * confirmed-human sessions over 10 days, 8.9k had our own domain as their first
 * referrer. Search traffic was therefore undercounted, and worst for the popular
 * (always-cached) pages search engines rank. The browser knows the real
 * `document.referrer`, so it reports the landing once per tab session.
 *
 * Only the referrer HOST is sent, never the full URL.
 */

export type ReferrerKind =
  | "google"
  | "bing"
  | "duckduckgo"
  | "yahoo"
  | "brave"
  | "ecosia"
  | "yandex"
  | "ai"
  | "social"
  | "internal"
  | "direct"
  | "other";

const RULES: ReadonlyArray<[RegExp, ReferrerKind]> = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.(com|co\.jp)$/, "yahoo"],
  [/(^|\.)brave\.com$/, "brave"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, "ai"],
  [
    /(^|\.)(reddit\.com|facebook\.com|t\.co|twitter\.com|x\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app|whatsapp\.com|telegram\.org|t\.me)$/,
    "social",
  ],
];

export function classifyReferrer(referrerHost: string | null, siteHost: string): ReferrerKind {
  if (!referrerHost) return "direct";
  const host = referrerHost.toLowerCase();
  if (host === siteHost || host.endsWith(`.${siteHost}`)) return "internal";
  // AI assistants first: gemini.google.com must not count as Google search.
  const ai = RULES.find(([re, kind]) => kind === "ai" && re.test(host));
  if (ai) return "ai";
  for (const [re, kind] of RULES) if (re.test(host)) return kind;
  return "other";
}

/** Host of a referrer URL, or null when there is none or it does not parse. */
export function referrerHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}

export const LANDING_SESSION_KEY = "mb_landing_reported";
