/**
 * Behavioural, COHORT-LEVEL scoring for UA-forging crawl fleets.
 *
 * The problem this solves: since the CDN began forwarding the viewer User-Agent
 * (Jul 28 2026) the fleets crawling this site arrive with genuine-looking Chrome
 * UAs, valid `sec-ch-ua` client hints, a forged `Referer: google.com`, and
 * residential-proxy IPs. Per-ROW classification (`bot-detection.ts` at ingest,
 * `bot-filter.ts` at query time) cannot see any of that — every individual
 * request looks like a person. The fleets are only visible in AGGREGATE, so this
 * module scores COHORTS and never single rows or single sessions.
 *
 * COHORT KEY: `(user_agent, country)`. Coarser keys (UA alone) merge fleets with
 * real humans sharing Chrome's reduced UA string, which makes the
 * zero-engagement test below always fail; finer keys fragment a fleet below any
 * usable volume gate. `(user_agent, country)` was the level at which the
 * measured fleets separated cleanly on prod.
 *
 * ---------------------------------------------------------------------------
 * THE MANDATORY GUARD: ~50% of REAL sessions legitimately have exactly one page
 * view. "One view = bot" is therefore NOT an acceptable filter and appears
 * nowhere below as a standalone rule. Every rule is gated behind BOTH a volume
 * floor AND a zero-engagement test, and each rule's own threshold sits at least
 * one order of magnitude away from anything organic traffic on this site
 * produces. Ground truth used to calibrate (Jul 2026): Search Console reports
 * ~147 clicks/day, 0-4 authenticated users/day, and 30-55 sessions/day that
 * perform any tracked action. Any single `(user_agent, country)` cohort that
 * alone exceeds those totals several times over, with zero engagement, is not
 * this site's audience.
 * ---------------------------------------------------------------------------
 *
 * WHAT IS DELIBERATELY *NOT* USED AS A FILTER (investigative flags only — see
 * `queries/audience.ts` abuse panel):
 *
 *  - **Absence of a client web-vitals beacon at SESSION level.** Measured on
 *    prod over 30 days: only 31 of 88 AUTHENTICATED (definitionally human)
 *    sessions ever produced a `performance` row — a 65% false-negative rate,
 *    because the client hook respects DNT, ad blockers eat the beacon, and a
 *    fast bounce can outrun the flush. Used ONLY as a cohort-level ratio (rule
 *    `no_js`), where the threshold is 17x below the observed human rate.
 *  - **Forged `Referer: google.com`.** Real and forged referers are
 *    indistinguishable per row; the overshoot vs Search Console is only visible
 *    in aggregate. Reported as a flag, never subtracted.
 *  - **Uniform `device_type` within a cohort.** Useless here by construction:
 *    the cohort key includes the exact User-Agent, which determines
 *    `device_type`, so every cohort is uniform. Kept out of the scorer
 *    deliberately (it would read as a signal while measuring nothing).
 *  - **Datacenter ASN.** Correct but nearly empty against these fleets
 *    (~450 rows/day) because they are on residential proxies. Left to the
 *    ingest-time `bot_type = 'datacenter'` label.
 */

// =============================================================================
// Thresholds
// =============================================================================

/**
 * Every threshold, with the reasoning that makes it safe against real humans.
 * Rate-style thresholds are per HOUR of the selected window so a 24h and a 30d
 * range flag the same behaviour rather than the same absolute totals.
 */
export const FLEET_THRESHOLDS = {
  /**
   * GATE 1 — absolute volume floor. Below this a cohort is statistical noise and
   * is never flagged no matter how mechanical it looks, because small samples
   * are exactly where a real bouncing visitor can imitate a crawler.
   */
  minCohortViews: 300,

  /**
   * GATE 2 — sustained rate floor: 25 views/hour ≈ 600 views/day from ONE
   * (UA, country) pair. The whole site receives ~147 search clicks/day, so a
   * single cohort at 4x that with zero engagement cannot be organic.
   */
  minViewsPerHour: 25,

  /**
   * RULE `no_js` — share of the cohort's sessions that ever POSTed a client
   * web-vitals beacon. Confirmed humans sit at ~35% (31/88 authed sessions over
   * 30 days). 2% is 17x below that, so a cohort of hundreds of real people
   * cannot land here even with heavy DNT/ad-block use; a server-side fetcher
   * that never runs our JS sits at exactly 0.
   */
  maxJsBeaconShare: 0.02,

  /**
   * RULE `no_js` companion floor — never apply the beacon rule to a handful of
   * sessions, where one privacy-hardened human could satisfy it.
   */
  minSessionsForJsRule: 10,

  /**
   * RULE `url_sweep` — unique paths ÷ views. At ≥ 0.85 almost every request is a
   * distinct URL. Humans re-render the same path constantly (back navigation,
   * refresh, returning to a title), so a near-1:1 path-to-view ratio sustained
   * over hundreds of views is enumeration, not reading.
   */
  minUrlSweepRatio: 0.85,

  /**
   * RULE `ip_rotation` — sessions/hour ≥ 20 (≈480/day) at ≤ 2.0 views/session.
   * `session_id` is a hash of IP + UA + Accept-Language, so a rotating proxy
   * pool mints a fresh session per request. The session floor is the guard: 480
   * distinct sessions/day in ONE (UA, country) cohort is ~10x this site's entire
   * daily audience, so the permissive 2.0 views/session ceiling (which real
   * bouncing traffic does reach) cannot be triggered by real humans at that
   * volume with zero engagement.
   */
  minSessionsPerHourForRotation: 20,
  maxViewsPerSessionForRotation: 2.0,

  /**
   * RULE `nav_hammer` — ≥ 8 views/session while touching ≤ 25% distinct paths.
   * Mechanical re-fetching of a tiny page set (measured: a Vietnamese cohort
   * doing 60k views/day across /browse, /topics, /privacy, /terms and six other
   * nav pages). A real binge session ALSO has high views/session, which is why
   * the path-diversity half is required: humans who view a lot view a lot of
   * DIFFERENT titles.
   */
  minViewsPerSessionForHammer: 8,
  maxPathRatioForHammer: 0.25,

  /**
   * RULE `enumeration` — ≥ 200 distinct paths/hour (≈4,800 URLs/day) from one
   * cohort. The site's real audience cannot request thousands of distinct URLs
   * per hour; catalog enumeration can and does. Catches JS-executing crawlers
   * that defeat every other rule (measured: a Singapore cohort at 33.9k distinct
   * paths/day with a 91% beacon rate).
   */
  minPathsPerHourForEnumeration: 200,
} as const;

/** Rule identifiers, in the order they are evaluated for display. */
export const FLEET_RULES = [
  "no_js",
  "url_sweep",
  "ip_rotation",
  "nav_hammer",
  "enumeration",
] as const;

export type FleetRule = (typeof FLEET_RULES)[number];

/** One-line explanation per rule, surfaced in the abuse panel. */
export const FLEET_RULE_LABELS: Record<FleetRule, string> = {
  no_js: "Never runs client JS",
  url_sweep: "One distinct URL per request",
  ip_rotation: "New IP per request",
  nav_hammer: "Re-fetches a tiny page set",
  enumeration: "Enumerating the catalog",
};

// =============================================================================
// Pure scorer
// =============================================================================

/** Aggregated metrics for one `(user_agent, country)` cohort over a window. */
export interface CohortMetrics {
  views: number;
  sessions: number;
  uniquePaths: number;
  /** Views from an authenticated visitor anywhere in the cohort. */
  authedViews: number;
  /** Sessions in the cohort that produced at least one `user_actions` row. */
  actedSessions: number;
  /** Sessions in the cohort that produced at least one client web-vitals beacon. */
  jsBeaconSessions: number;
  /** Length of the analysis window, in hours. */
  windowHours: number;
}

/**
 * Which fleet rules a cohort matches. Empty array = not flagged.
 *
 * Mirrors the SQL in `buildFleetCohortSql` exactly; both are exercised by
 * `fleet-scoring.test.ts` so the TS and SQL definitions cannot drift.
 */
export function scoreCohort(m: CohortMetrics): FleetRule[] {
  const t = FLEET_THRESHOLDS;
  const hours = Math.max(1, m.windowHours);

  // Guards first: any engagement at all, or too little volume, means we do not
  // score the cohort. A cohort containing even ONE authenticated view or ONE
  // acting session is spared entirely — real people are in it.
  if (m.sessions <= 0 || m.views <= 0) return [];
  if (m.authedViews > 0 || m.actedSessions > 0) return [];
  if (m.views < t.minCohortViews) return [];
  if (m.views / hours < t.minViewsPerHour) return [];

  const viewsPerSession = m.views / m.sessions;
  const pathRatio = m.uniquePaths / m.views;
  const jsShare = m.jsBeaconSessions / m.sessions;

  const matched: FleetRule[] = [];
  if (jsShare <= t.maxJsBeaconShare && m.sessions >= t.minSessionsForJsRule) {
    matched.push("no_js");
  }
  if (pathRatio >= t.minUrlSweepRatio) {
    matched.push("url_sweep");
  }
  if (
    m.sessions / hours >= t.minSessionsPerHourForRotation &&
    viewsPerSession <= t.maxViewsPerSessionForRotation
  ) {
    matched.push("ip_rotation");
  }
  if (
    viewsPerSession >= t.minViewsPerSessionForHammer &&
    pathRatio <= t.maxPathRatioForHammer
  ) {
    matched.push("nav_hammer");
  }
  if (m.uniquePaths / hours >= t.minPathsPerHourForEnumeration) {
    matched.push("enumeration");
  }
  return matched;
}

// =============================================================================
// SQL builders
// =============================================================================

/**
 * Hours covered by a range, used as the denominator for every rate threshold.
 * `days: 0` means "since midnight UTC", whose length changes through the day —
 * computed in JS (not SQL) so the TS scorer and the generated SQL always agree.
 */
export function getWindowHours(days: number): number {
  if (days > 0) return days * 24;
  const elapsed = (Date.now() - Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  )) / 3_600_000;
  return Math.max(1, Math.round(elapsed * 100) / 100);
}

/** The two engagement CTEs every fleet query needs. Emitted without `WITH`. */
export function buildEngagementCtesSql(timeCondition: string): string {
  return `
    acted_sessions AS (
      SELECT DISTINCT session_id FROM user_actions
      WHERE ${timeCondition} AND is_bot = 0 AND session_id != ''
    ),
    js_sessions AS (
      SELECT DISTINCT session_id FROM performance
      WHERE ${timeCondition} AND session_id != ''
    )`;
}

/**
 * `SELECT user_agent, country` over the flagged cohorts — the body of a `fleet`
 * CTE. Requires `acted_sessions` and `js_sessions` (see
 * `buildEngagementCtesSql`) to already be in scope.
 *
 * `scopeSql` is the row predicate defining the pool being scored (normally
 * `UNCLASSIFIED_SQL` — rows no per-row rule already caught).
 *
 * COST: one aggregation over the window's `page_views` (measured 0.56s for 24h /
 * 1.9s for 7d on prod: ~1.6M / ~9.5M rows read). No per-row window functions.
 */
export function buildFleetCohortSql(
  timeCondition: string,
  scopeSql: string,
  windowHours: number
): string {
  const t = FLEET_THRESHOLDS;
  const hours = Math.max(1, windowHours);

  return `
    SELECT user_agent, country
    FROM page_views
    WHERE ${timeCondition} AND ${scopeSql}
    GROUP BY user_agent, country
    HAVING count() >= ${t.minCohortViews}
       AND count() / ${hours} >= ${t.minViewsPerHour}
       AND max(is_authenticated) = 0
       AND uniqIf(session_id, session_id IN acted_sessions) = 0
       AND (
         (uniqIf(session_id, session_id IN js_sessions) / uniq(session_id) <= ${t.maxJsBeaconShare}
           AND uniq(session_id) >= ${t.minSessionsForJsRule})
         OR uniq(path) / count() >= ${t.minUrlSweepRatio}
         OR (uniq(session_id) / ${hours} >= ${t.minSessionsPerHourForRotation}
           AND count() / uniq(session_id) <= ${t.maxViewsPerSessionForRotation})
         OR (count() / uniq(session_id) >= ${t.minViewsPerSessionForHammer}
           AND uniq(path) / count() <= ${t.maxPathRatioForHammer})
         OR uniq(path) / ${hours} >= ${t.minPathsPerHourForEnumeration}
       )`;
}

/**
 * ClickHouse expression producing the `+`-joined rule labels for a cohort, for
 * use in a SELECT over an already-grouped cohort query. Column names must match
 * the aliases used by `buildFleetCohortDetailSql`.
 */
export function buildRuleLabelExpr(windowHours: number): string {
  const t = FLEET_THRESHOLDS;
  const hours = Math.max(1, windowHours);
  return `arrayStringConcat(arrayFilter(x -> x != '', [
    if(js_beacon_sessions / sessions <= ${t.maxJsBeaconShare} AND sessions >= ${t.minSessionsForJsRule}, 'no_js', ''),
    if(unique_paths / views >= ${t.minUrlSweepRatio}, 'url_sweep', ''),
    if(sessions / ${hours} >= ${t.minSessionsPerHourForRotation} AND views / sessions <= ${t.maxViewsPerSessionForRotation}, 'ip_rotation', ''),
    if(views / sessions >= ${t.minViewsPerSessionForHammer} AND unique_paths / views <= ${t.maxPathRatioForHammer}, 'nav_hammer', ''),
    if(unique_paths / ${hours} >= ${t.minPathsPerHourForEnumeration}, 'enumeration', '')
  ]), '+')`;
}
