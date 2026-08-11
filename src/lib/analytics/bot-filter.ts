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
 * redeploy. Exact UA → `FORCE_BOT_UA_EXACT`; family/substring → `FORCE_BOT_UA_SUBSTRINGS`;
 * a referer that CANNOT occur naturally → `FORCE_BOT_REFERER_SUBSTRINGS`.
 *
 * THE BAR FOR ADDING A RULE HERE: it must be DETERMINISTIC — a property no real
 * browser can produce, not a behaviour real users merely produce rarely. This
 * predicate feeds the reported human number, so a rule with any measurable
 * false-positive rate against confirmed humans belongs in the abuse panel's
 * investigative flags instead (see `fleet-scoring.ts` for the ones that were
 * measured and rejected).
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
 * Case-insensitive `referer` substrings that are PROVABLY forged, and therefore
 * safe to classify as bot deterministically (no behavioural inference).
 *
 * `google.com/search?q=` — Google has stripped the query string from its organic
 * search referers since October 2011 ("secure search"); a real organic click
 * arrives with the ORIGIN only (`https://www.google.com/`), never the full search
 * URL. So a referer carrying `/search?q=` cannot come from a Google result click.
 *
 * Verified on prod before shipping (7 days): 2,355 views / 2,355 sessions across
 * 108 countries, all replaying the same `?q=site%3Athemoviebrowser.com` — a
 * scraper enumerating us via Google's `site:` operator. **Zero authenticated
 * views and zero acting sessions matched**, so the rule has no measured overlap
 * with confirmed humans. Honest caveat: 2,353 of those 2,355 were ALREADY
 * `is_bot = 1`, so the rule's marginal effect on today's numbers is ~2 rows — it
 * is here for determinism, for history, and to stay correct if the fleet ever
 * drops its other tells, NOT because it moves the current total.
 */
export const FORCE_BOT_REFERER_SUBSTRINGS: readonly string[] = ["google.com/search?q="];

/**
 * A `referer` naming an origin with NO path component at all — provably forged,
 * because the WHATWG URL serializer always emits "/" for an empty path. Every
 * referer a real user agent sends therefore has one. RE2 pattern, matched
 * case-insensitively against the trimmed value.
 *
 * This is the query-time twin of the proxy's `forged_referer` shed (see
 * `isForgedOriginReferer` in `bot-detection.ts` and the Aug 11 2026 incident in
 * `.claude/rules/cdn.md`). Both are needed, and for different rows:
 *   - the PROXY shed stops the origin renders, but only sees requests that reach
 *     the origin;
 *   - CloudFront edge HITs never reach the origin at all, and this fleet
 *     executes JS, so its client beacon still POSTs to `/api/analytics/ingest`
 *     and lands as `is_bot = 0`. Only a query-time rule can label those.
 * It also reclassifies the ~2.19M views/7d of HISTORY that predate the shed,
 * with no re-ingest.
 *
 * Measured on prod (7d/30d) before shipping: 2,192,483 views / 2,002,073
 * sessions / **0 authenticated** on the path-less form, against 4,119 views /
 * 118 authenticated on the slashed form; every other origin-only referer on the
 * site (Bing, DuckDuckGo, Google, Baidu, Yandex, Yahoo, Brave, Ecosia, our own
 * www/http/origin variants) carries the slash. Against 1,099 CONFIRMED human
 * sessions over 30 days it matches 0 sessions and 0 of 54,736 views.
 *
 * Unlike the `google.com/search?q=` rule above, this one MOVES THE NUMBERS a
 * lot: it is the single largest correction to the "human" bucket since UA
 * forwarding shipped, and the direct cause of the post-Jul-28 human hump that
 * `audience.ts` warns about.
 */
export const FORCE_BOT_PATHLESS_REFERER_RE = "(?i)^https?://[^/]+$";

/**
 * A `user_agent` outside these bounds is automated. Wikimedia's published
 * pageview classifier uses exactly this 25–400 character window, which is the
 * best open precedent available (they publish and version their thresholds).
 *
 * Measured on prod: 13 views / 12 sessions in 24h, shortest UA 11 chars — a
 * rounding error in volume, kept because it is deterministic, free (no extra
 * scan) and independently attested. Real browser UAs are ~90-180 chars; nothing
 * legitimate is anywhere near these bounds.
 */
export const MIN_HUMAN_UA_LENGTH = 25;
export const MAX_HUMAN_UA_LENGTH = 400;

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
  assertSafe(FORCE_BOT_REFERER_SUBSTRINGS);
  assertSafe([FORCE_BOT_PATHLESS_REFERER_RE]);

  const clauses: string[] = ["is_bot = 1"];

  if (FORCE_BOT_UA_EXACT.length > 0) {
    const list = FORCE_BOT_UA_EXACT.map((ua) => `'${ua}'`).join(", ");
    clauses.push(`user_agent IN (${list})`);
  }

  for (const sub of FORCE_BOT_UA_SUBSTRINGS) {
    clauses.push(`positionCaseInsensitive(user_agent, '${sub}') > 0`);
  }

  // Provably-forged referers. `referer` is Nullable, and in ClickHouse a NULL
  // operand makes the whole OR-chain NULL rather than false — which would drop
  // every referer-less row out of BOTH the bot and human buckets. `ifNull`
  // keeps the predicate strictly boolean.
  for (const sub of FORCE_BOT_REFERER_SUBSTRINGS) {
    clauses.push(`ifNull(positionCaseInsensitive(referer, '${sub}') > 0, 0)`);
  }

  // Path-less referer (origin with no "/"). Same `ifNull` reasoning as above.
  clauses.push(`ifNull(match(trimBoth(referer), '${FORCE_BOT_PATHLESS_REFERER_RE}'), 0)`);

  // UA-length bounds (Wikimedia's published window). Empty UAs are already
  // `bot_type='empty_ua'` at ingest; this also catches truncated/handcrafted ones.
  clauses.push(
    `(length(user_agent) > 0 AND (length(user_agent) < ${MIN_HUMAN_UA_LENGTH}` +
      ` OR length(user_agent) > ${MAX_HUMAN_UA_LENGTH}))`
  );

  return `(${clauses.join(" OR ")})`;
}

/**
 * ClickHouse boolean fragment over `page_views` that is TRUE for bot rows.
 * Default: `(is_bot = 1 OR user_agent IN ('Amazon CloudFront'))`.
 */
export const BOT_SQL: string = buildBotSql();

/** ClickHouse boolean fragment that is TRUE for human rows (the complement). */
export const HUMAN_SQL: string = `NOT ${BOT_SQL}`;
