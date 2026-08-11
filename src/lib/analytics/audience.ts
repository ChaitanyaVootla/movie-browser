/**
 * Query-time AUDIENCE taxonomy for the admin Traffic views.
 *
 * WHY A THREE-WAY SPLIT REPLACED HUMAN-vs-BOT (Jul 30 2026).
 * The binary split stopped meaning anything the moment the CDN started
 * forwarding the viewer User-Agent (Jul 28 2026). Before that, ~94-95% of all
 * requests reached the origin as `User-Agent: Amazon CloudFront` and
 * `bot-filter.ts` force-classified them as bots, so the "Human" line sat near
 * zero and nobody looked at it. After UA forwarding the SAME traffic started
 * arriving with its real — and overwhelmingly FORGED — Chrome user agents plus
 * valid `sec-ch-ua` client hints, and the "Human" line jumped from ~0 to
 * 15-30k views/hour with no change in actual visitors. Measured on prod:
 * `is_bot = 0` page views went from ~13-23k/day (Jul 22-27) to 309k/day on
 * Jul 28 and 560k/day on Jul 29.
 *
 * The forging fleets also spoof `Referer: https://www.google.com/` (analytics
 * reported ~3.2k "search referrals" on a day Search Console reported 147
 * clicks) and run on RESIDENTIAL proxies (VNPT-VN consumer ISP, Mexican and
 * Venezuelan consumer ranges), so neither the UA, the referer, nor the
 * datacenter-ASN label catches them: `bot_type = 'datacenter'` accounts for
 * ~450 views/day out of ~560k.
 *
 * So this module splits traffic into THREE audiences instead of two:
 *
 *  1. VERIFIED CRAWLERS — search engines and unfurl agents we WANT (Googlebot,
 *     Bingbot, Applebot, ChatGPT-User, Slack/Discord previews …). Watched as a
 *     crawl-budget report, never as "traffic".
 *  2. BOTS & SUSPECTED FLEETS — every other non-human row: the shed's own 429
 *     labels, the scraper/AI/tool bot types, the CloudFront pseudo-UA, and
 *     whatever `fleet-scoring.ts` flags behaviourally.
 *  3. HUMANS — the residue, reported at two confidence levels because the
 *     residue is still not clean (see `fleet-scoring.ts` for what is provably
 *     safe to filter and what is only an investigative flag).
 *
 * Everything here is QUERY-TIME, which means it also reclassifies historical
 * rows — the ingest-time `is_bot` / `bot_type` flags are frozen per row and are
 * deliberately left alone.
 *
 * These values are CODE-DEFINED (never user input), so there is no injection
 * risk; `assertSafeLiterals` only guards against a developer typo silently
 * corrupting the generated SQL.
 */

import { getBotTypesByCategory } from "./bot-detection";
import { BOT_SQL } from "./bot-filter";

// =============================================================================
// Bot-type sets
// =============================================================================

/**
 * Crawlers and agents we deliberately serve. Search engines are the crawl-budget
 * story; `social` covers the link-unfurl bots (Slack/Discord/WhatsApp previews)
 * that are load-bearing for sharing; `chatgpt` is ChatGPT-User, a
 * human-initiated fetch that `src/proxy.ts` deliberately does NOT shed.
 *
 * CAVEAT the UI must state: `bot_type` is derived from the User-Agent, so a
 * forged Googlebot UA lands in this bucket. Confirming a crawler needs a
 * reverse-DNS check we do not perform.
 */
export const VERIFIED_CRAWLER_BOT_TYPES: readonly string[] = [
  ...getBotTypesByCategory("search_engine", "social"),
  "chatgpt",
];

/**
 * `bot_type` values written by the `src/proxy.ts` shed, i.e. requests we
 * answered with a 429 rather than rendering. Tracked separately so the abuse
 * panel can report how much load the shed actually absorbed.
 *
 * Mirrors `BLOCKED_BOT_TYPES` + `scraperShedReason`'s two synthetic labels in
 * `src/proxy.ts`. Kept as a literal list rather than importing from the proxy:
 * the proxy module pulls in Next request types and auth, which has no business
 * being dragged into an analytics query path.
 */
export const SHED_BOT_TYPES: readonly string[] = [
  "markdown_scraper",
  "datacenter_fleet",
  "forged_referer",
  "webdriver",
  "headless_hint",
  "missing_client_hints",
  "stale_chrome",
  "bytedance",
  "openai",
  "anthropic",
  "common_crawl",
  "cohere",
  "amazon",
  "meta",
];

/**
 * Non-human labels that are NOT shed (still served) and are NOT crawlers we
 * want: the analytics-only datacenter-ASN label plus the generic scraper
 * patterns. Everything left over after the crawler and shed sets.
 */
export const OTHER_BOT_LABELS: readonly string[] = ["datacenter", "headless_preset"];

// =============================================================================
// SQL fragments
// =============================================================================

function assertSafeLiterals(values: readonly string[]): void {
  for (const v of values) {
    if (!/^[a-z0-9_]+$/i.test(v)) {
      throw new Error(
        `audience: unsafe bot_type literal ${JSON.stringify(v)} — ` +
          "only [A-Za-z0-9_] is allowed (these are code-defined labels)."
      );
    }
  }
}

function inList(values: readonly string[]): string {
  assertSafeLiterals(values);
  return values.map((v) => `'${v}'`).join(", ");
}

/**
 * TRUE for a crawler/agent we deliberately serve. Requires `is_bot = 1` so a
 * behaviourally-flagged row can never be laundered into this bucket by a forged
 * `bot_type` that ingest did not itself assign.
 */
export const VERIFIED_CRAWLER_SQL = `(is_bot = 1 AND bot_type IN (${inList(
  VERIFIED_CRAWLER_BOT_TYPES
)}))`;

/** TRUE for a row the proxy shed answered with a 429. */
export const SHED_SQL = `(bot_type IN (${inList(SHED_BOT_TYPES)}))`;

/**
 * TRUE for any non-human row that is NOT a crawler we want. This is the static
 * half of the "Bots & suspected fleets" bucket; `fleet-scoring.ts` contributes
 * the behavioural half at query time.
 */
export const KNOWN_BOT_NON_CRAWLER_SQL = `(${BOT_SQL} AND NOT ${VERIFIED_CRAWLER_SQL})`;

/**
 * TRUE for rows that survive every per-row rule — the pool the human numbers are
 * computed from. Still contains unflagged fleet traffic; see `fleet-scoring.ts`.
 */
export const UNCLASSIFIED_SQL = `(NOT ${BOT_SQL})`;

// =============================================================================
// Display metadata
// =============================================================================

export type AudienceBucket = "verifiedCrawler" | "botFleet" | "human";

/** Human-readable crawler names for the verified-crawler table. */
export const CRAWLER_LABELS: Record<string, string> = {
  googlebot: "Googlebot",
  googleother: "GoogleOther",
  google_inspection: "Google Inspection Tool",
  bingbot: "Bingbot",
  apple: "Applebot",
  yandex: "YandexBot",
  baidu: "Baiduspider",
  duckduckgo: "DuckDuckBot",
  yahoo: "Yahoo Slurp",
  msn: "MSNBot",
  seznam: "SeznamBot",
  chatgpt: "ChatGPT-User",
  facebook: "Facebook preview",
  twitter: "X/Twitter card",
  linkedin: "LinkedIn preview",
  slack: "Slack unfurl",
  discord: "Discord unfurl",
  telegram: "Telegram preview",
  whatsapp: "WhatsApp preview",
  reddit: "Reddit preview",
  pinterest: "Pinterest",
  embedly: "Embedly",
  flipboard: "Flipboard",
  vk: "VK share",
};

/** Why the shed fired, for the abuse panel's 429 breakdown. */
export const SHED_REASON_LABELS: Record<string, string> = {
  markdown_scraper: "LLM scraper (Accept: text/markdown)",
  datacenter_fleet: "Datacenter/hosting ASN",
  forged_referer: "Forged referer (origin, no path)",
  webdriver: "navigator.webdriver",
  headless_hint: "Headless client hint",
  missing_client_hints: "Chrome UA, no client hints",
  stale_chrome: "Chrome ≤ 109 (stale UA)",
  bytedance: "ByteSpider",
  openai: "GPTBot",
  anthropic: "ClaudeBot",
  common_crawl: "CCBot",
  cohere: "cohere-ai",
  amazon: "Amazonbot",
  meta: "meta-externalagent",
};
