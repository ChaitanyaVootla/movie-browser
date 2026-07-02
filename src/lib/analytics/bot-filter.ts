/**
 * Query-time bot classification for analytics.
 *
 * WHY THIS EXISTS (separate from the ingest-time `is_bot` flag):
 * `page_views.is_bot` is computed once at ingest (see `bot-detection.ts`) and
 * then frozen. It misses cases we only understood later, and re-ingesting
 * history isn't practical. The biggest miss: behind CloudFront the origin does
 * NOT receive the real User-Agent (the origin-request policy doesn't forward
 * it), so every CDN cache-miss origin fetch arrives with `User-Agent: Amazon
 * CloudFront` — which matches no bot pattern and lands as `is_bot = 0`. That
 * single UA was ~83% of "human" page views in July 2026, badly inflating the
 * human numbers. Rather than trust the frozen flag, the analytics traffic
 * queries classify bot-vs-human at QUERY time using the predicate below, so it
 * also reclassifies HISTORICAL rows and can be refined without a re-ingest or a
 * schema change.
 *
 * HOW TO UPDATE (the whole point — keep this cheap):
 * When a new non-`is_bot`-flagged crawler/CDN/agent shows up in the "Top Bot
 * User Agents" card as fake-human volume, add it to one of the arrays below and
 * redeploy. Exact UA → `FORCE_BOT_UA_EXACT`; family/substring → `FORCE_BOT_UA_SUBSTRINGS`.
 *
 * NOT covered here (deliberately): stealth fleets that forge a real browser UA
 * + client hints. Those are behavioral/session-level (rotating IPs, ~1.0
 * views/session) and can't be caught by a per-row UA predicate — the
 * `engagedSessions` metric (2+ views OR authed OR any action) is the better
 * proxy for real humans there.
 *
 * These values are CODE-DEFINED (never user input), so there is no runtime
 * injection risk; `assertSafe()` is just a guard against a typo (a stray quote)
 * silently breaking the generated SQL at query time.
 */

/** Exact User-Agent strings that are always bots regardless of the ingest flag. */
export const FORCE_BOT_UA_EXACT: readonly string[] = [
  "Amazon CloudFront", // CDN origin-fetch UA (see module doc) — the big one
];

/** Case-insensitive User-Agent substrings that are always bots. */
export const FORCE_BOT_UA_SUBSTRINGS: readonly string[] = [
  // e.g. add "claudebot", "gptbot" here if they ever slip past ingest is_bot.
];

/**
 * Guard: reject any value that would break the generated SQL string literal.
 * Values are code-defined so this only ever fires on a developer typo.
 */
function assertSafe(values: readonly string[]): void {
  for (const v of values) {
    if (v.includes("'") || v.includes("\\")) {
      throw new Error(
        `bot-filter: unsafe character in bot-rule value ${JSON.stringify(v)} — ` +
          "quotes/backslashes are not allowed (these are code-defined literals)."
      );
    }
  }
}

function buildBotSql(): string {
  assertSafe(FORCE_BOT_UA_EXACT);
  assertSafe(FORCE_BOT_UA_SUBSTRINGS);

  const clauses: string[] = ["is_bot = 1"];

  if (FORCE_BOT_UA_EXACT.length > 0) {
    const list = FORCE_BOT_UA_EXACT.map((ua) => `'${ua}'`).join(", ");
    clauses.push(`user_agent IN (${list})`);
  }

  for (const sub of FORCE_BOT_UA_SUBSTRINGS) {
    clauses.push(`positionCaseInsensitive(user_agent, '${sub}') > 0`);
  }

  return `(${clauses.join(" OR ")})`;
}

/**
 * ClickHouse boolean fragment over `page_views` that is TRUE for bot rows.
 * Default: `(is_bot = 1 OR user_agent IN ('Amazon CloudFront'))`.
 */
export const BOT_SQL: string = buildBotSql();

/** ClickHouse boolean fragment that is TRUE for human rows (the complement). */
export const HUMAN_SQL: string = `NOT ${BOT_SQL}`;
