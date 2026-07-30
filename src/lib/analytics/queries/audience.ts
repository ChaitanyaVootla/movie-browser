/**
 * Audience Analytics Queries — the three-way honest split.
 *
 * Powers the rebuilt admin Traffic tab: verified crawlers vs bots/suspected
 * fleets vs humans, plus the abuse panel and the crawler crawl-budget report.
 * The taxonomy lives in `../audience.ts`; the behavioural cohort scorer and all
 * of its thresholds (with false-positive reasoning) live in `../fleet-scoring.ts`.
 *
 * COST DISCIPLINE (2 vCPU box, ClickHouse capped at 0.9 CPU): one aggregate
 * query per panel, no per-row window functions except the single sessionization
 * needed for engaged visits. Measured on prod via the read-only tunnel:
 * overview 0.6s (24h) / 1.9s (7d), trend 0.7s (24h) / 2.2s (7d).
 */

import { query } from "../client";
import { BOT_SQL } from "../bot-filter";
import {
  KNOWN_BOT_NON_CRAWLER_SQL,
  SHED_REASON_LABELS,
  SHED_SQL,
  UNCLASSIFIED_SQL,
  VERIFIED_CRAWLER_SQL,
} from "../audience";
import {
  buildEngagementCtesSql,
  buildFleetCohortSql,
  buildRuleLabelExpr,
  getWindowHours,
  type FleetRule,
} from "../fleet-scoring";
import { getTimeRangeCondition, type TimeRange } from "./types";

// =============================================================================
// Types
// =============================================================================

export type AudienceGranularity = "hour" | "day";

export interface AudienceOverview {
  /** Every tracked document request in the range, no filtering at all. */
  rawViews: number;
  /** Crawlers/agents we deliberately serve (UA-derived — see the UI caveat). */
  verifiedCrawlerViews: number;
  /** Non-human rows that are not wanted crawlers, incl. behaviourally-flagged cohorts. */
  botFleetViews: number;
  /** Of `botFleetViews`, how many the proxy answered with a 429. */
  shedViews: number;
  /** Of `botFleetViews`, how many only the behavioural cohort scorer caught. */
  behaviourallyFlaggedViews: number;
  /** Requests left after every rule — the human upper bound. */
  humanViews: number;
  /**
   * Sessions in the human pool with 2+ views inside one 30-minute-gap visit, or
   * authenticated, or with any tracked action. An UPPER BOUND: the residue still
   * contains fleet traffic the scorer cannot safely flag.
   */
  engagedHumanSessions: number;
  /**
   * Sessions that are authenticated or performed a tracked action. A hard FLOOR —
   * these cannot be faked without running our client JS and hitting a mutation.
   */
  confirmedHumanSessions: number;
  /** Distinct authenticated users in the range. */
  authenticatedUsers: number;
  /** Number of `(user_agent, country)` cohorts the behavioural scorer flagged. */
  flaggedCohorts: number;
}

export interface AudienceTrendPoint {
  date: string;
  verifiedCrawlerViews: number;
  botFleetViews: number;
  humanViews: number;
  confirmedHumanViews: number;
  rawViews: number;
  /**
   * Of `botFleetViews`, the ones the proxy answered with a 429. Carried on this
   * query rather than a separate shed-trend query: it is one more `countIf` over
   * a scan that already happens, and the fleet CTE is the expensive part.
   */
  shedViews: number;
}

export interface FleetCohort {
  userAgent: string;
  country: string;
  views: number;
  sessions: number;
  uniquePaths: number;
  viewsPerSession: number;
  pathRatio: number;
  jsBeaconShare: number;
  rules: FleetRule[];
  topPageType: string;
}

export interface ShedReasonStat {
  botType: string;
  label: string;
  views: number;
  uniquePaths: number;
}

export interface FleetTarget {
  key: string;
  views: number;
  uniquePaths: number;
}

export interface AbuseFlags {
  /** Views claiming a Google referer, in the human pool. */
  googleRefererViews: number;
  /** Sessions claiming a Google referer, in the human pool. */
  googleRefererSessions: number;
  /** Human-pool views with no referer at all. */
  noRefererViews: number;
  /** Human-pool sessions that never produced a client web-vitals beacon. */
  noBeaconSessions: number;
  /** Human-pool sessions total (denominator for the two ratios above). */
  humanPoolSessions: number;
}

export interface CrawlerStat {
  botType: string;
  label: string;
  views: number;
  uniquePaths: number;
  activeDays: number;
  topPageType: string;
}

export interface CrawlerTrendPoint {
  date: string;
  /** Views per `bot_type`, sparse — absent keys mean zero. */
  byCrawler: Record<string, number>;
}

// =============================================================================
// Shared SQL
// =============================================================================

/**
 * 30 minutes of inactivity ends a visit. Same constant as `traffic.ts` — a
 * fingerprint `session_id` (IP + UA + Accept-Language) recurs for days, so
 * per-id min/max measures how long we have SEEN a visitor, not a visit.
 */
export const VISIT_GAP_SECONDS = 30 * 60;

const num = (v: string | undefined): number => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * `WITH` preamble shared by every audience query: the two engagement CTEs plus
 * the flagged-cohort set. Emitted as a single string so each panel stays one
 * round trip.
 */
function buildPreamble(timeCondition: string, windowHours: number): string {
  return `WITH
    ${buildEngagementCtesSql(timeCondition)},
    fleet AS (${buildFleetCohortSql(timeCondition, UNCLASSIFIED_SQL, windowHours)})`;
}

/**
 * TRUE when a row belongs to a behaviourally-flagged cohort.
 *
 * The outer parentheses are LOAD-BEARING: ClickHouse parses a bare
 * `NOT (user_agent, country) IN fleet` as `not(user_agent, country) IN fleet`,
 * i.e. it binds `NOT` to the tuple and fails with
 * "Number of arguments for function not doesn't match: passed 2, should be 1".
 */
const IN_FLEET_SQL = "((user_agent, country) IN fleet)";

/** Final bucket predicates, applied in priority order. */
const BUCKET_CRAWLER = VERIFIED_CRAWLER_SQL;
const BUCKET_BOT = `(${KNOWN_BOT_NON_CRAWLER_SQL} OR (${UNCLASSIFIED_SQL} AND ${IN_FLEET_SQL}))`;
const BUCKET_HUMAN = `(${UNCLASSIFIED_SQL} AND NOT ${IN_FLEET_SQL})`;

/** TRUE for a row whose session is authenticated or performed a tracked action. */
const CONFIRMED_SQL = "(is_authenticated = 1 OR session_id IN acted_sessions)";

// =============================================================================
// Overview
// =============================================================================

export async function getAudienceOverview(range: TimeRange): Promise<AudienceOverview> {
  const timeCondition = getTimeRangeCondition(range);
  const windowHours = getWindowHours(range.days);
  const preamble = buildPreamble(timeCondition, windowHours);

  // Two queries, not three: the flagged-cohort COUNT rides along on the totals
  // as `uniqIf(tuple(...))` rather than a third `SELECT count() FROM fleet`,
  // which would re-run the whole cohort aggregation (measured +0.25s at 24h,
  // +1.0s at 7d). Run in parallel — both hold only small `uniq` states, so the
  // box's 1 GiB ClickHouse limit is not at risk, and it halves 30-day wall time.
  const totalsSql = `
    ${preamble}
    SELECT
      count() AS raw_views,
      countIf(${BUCKET_CRAWLER}) AS crawler_views,
      countIf(${BUCKET_BOT}) AS bot_views,
      countIf(${SHED_SQL}) AS shed_views,
      countIf(${UNCLASSIFIED_SQL} AND ${IN_FLEET_SQL}) AS flagged_views,
      countIf(${BUCKET_HUMAN}) AS human_views,
      uniqIf(user_id, user_id IS NOT NULL AND is_authenticated = 1) AS authed_users,
      uniqIf(tuple(user_agent, country), ${UNCLASSIFIED_SQL} AND ${IN_FLEET_SQL}) AS cohorts
    FROM page_views
    WHERE ${timeCondition}
  `;

  const sessionsSql = `
    ${preamble}
    SELECT
      uniq(session_id) AS engaged_sessions,
      uniqIf(session_id, confirmed) AS confirmed_sessions
    FROM (
      SELECT
        session_id,
        max(visit_views) AS max_visit_views,
        max(confirmed) AS confirmed
      FROM (
        SELECT
          session_id,
          confirmed,
          count() OVER (PARTITION BY session_id, visit_no) AS visit_views
        FROM (
          SELECT
            session_id,
            confirmed,
            sum(is_new_visit) OVER (
              PARTITION BY session_id ORDER BY ts
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS visit_no
          FROM (
            SELECT
              session_id,
              timestamp AS ts,
              ${CONFIRMED_SQL} AS confirmed,
              dateDiff(
                'second',
                lagInFrame(timestamp) OVER (
                  PARTITION BY session_id ORDER BY timestamp
                  ROWS BETWEEN 1 PRECEDING AND CURRENT ROW
                ),
                timestamp
              ) > ${VISIT_GAP_SECONDS} AS is_new_visit
            FROM page_views
            WHERE ${timeCondition} AND ${BUCKET_HUMAN} AND session_id != ''
          )
        )
      )
      GROUP BY session_id
      HAVING max_visit_views >= 2 OR confirmed = 1
    )
  `;

  const [totalRows, sessionRows] = await Promise.all([
    query<Record<string, string>>(totalsSql),
    query<Record<string, string>>(sessionsSql),
  ]);
  const totals = totalRows[0];
  const sessions = sessionRows[0];

  return {
    rawViews: num(totals?.raw_views),
    verifiedCrawlerViews: num(totals?.crawler_views),
    botFleetViews: num(totals?.bot_views),
    shedViews: num(totals?.shed_views),
    behaviourallyFlaggedViews: num(totals?.flagged_views),
    humanViews: num(totals?.human_views),
    engagedHumanSessions: num(sessions?.engaged_sessions),
    confirmedHumanSessions: num(sessions?.confirmed_sessions),
    authenticatedUsers: num(totals?.authed_users),
    flaggedCohorts: num(totals?.cohorts),
  };
}

// =============================================================================
// Trend
// =============================================================================

export async function getAudienceTrend(
  range: TimeRange,
  granularity: AudienceGranularity = "day"
): Promise<AudienceTrendPoint[]> {
  const timeCondition = getTimeRangeCondition(range);
  const windowHours = getWindowHours(range.days);
  const bucket = granularity === "hour" ? "toStartOfHour(timestamp)" : "toDate(timestamp)";

  // The flagged-cohort set is computed ONCE over the whole range and applied to
  // every bucket. Re-scoring per bucket would be both far more expensive and
  // statistically worse (an hour is too short a window for the rate thresholds).
  const rows = await query<Record<string, string>>(`
    ${buildPreamble(timeCondition, windowHours)}
    SELECT
      ${bucket} AS b,
      countIf(${BUCKET_CRAWLER}) AS crawler_views,
      countIf(${BUCKET_BOT}) AS bot_views,
      countIf(${BUCKET_HUMAN}) AS human_views,
      countIf(${BUCKET_HUMAN} AND ${CONFIRMED_SQL}) AS confirmed_views,
      countIf(${SHED_SQL}) AS shed_views,
      count() AS raw_views
    FROM page_views
    WHERE ${timeCondition}
    GROUP BY b
    ORDER BY b
  `);

  return rows.map((r) => ({
    date: r.b,
    verifiedCrawlerViews: num(r.crawler_views),
    botFleetViews: num(r.bot_views),
    humanViews: num(r.human_views),
    confirmedHumanViews: num(r.confirmed_views),
    rawViews: num(r.raw_views),
    shedViews: num(r.shed_views),
  }));
}

// =============================================================================
// Abuse panel
// =============================================================================

/**
 * Top flagged cohorts with the discriminators that got them flagged — the row
 * the owner reads before deciding the next shed rule, so every number that went
 * into the decision is shown, not just the volume.
 */
export async function getFleetCohorts(range: TimeRange, limit = 15): Promise<FleetCohort[]> {
  const timeCondition = getTimeRangeCondition(range);
  const windowHours = getWindowHours(range.days);

  const rows = await query<Record<string, string>>(`
    WITH
      ${buildEngagementCtesSql(timeCondition)},
      fleet AS (${buildFleetCohortSql(timeCondition, UNCLASSIFIED_SQL, windowHours)}),
      cohorts AS (
        SELECT
          user_agent,
          country,
          count() AS views,
          uniq(session_id) AS sessions,
          uniq(path) AS unique_paths,
          uniqIf(session_id, session_id IN js_sessions) AS js_beacon_sessions,
          topK(1)(page_type)[1] AS top_page_type
        FROM page_views
        WHERE ${timeCondition} AND ${UNCLASSIFIED_SQL} AND ${IN_FLEET_SQL}
        GROUP BY user_agent, country
      )
    SELECT
      user_agent, country, views, sessions, unique_paths, js_beacon_sessions, top_page_type,
      ${buildRuleLabelExpr(windowHours)} AS rules
    FROM cohorts
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => {
    const views = num(r.views);
    const sessions = num(r.sessions);
    return {
      userAgent: r.user_agent ?? "",
      country: r.country ?? "unknown",
      views,
      sessions,
      uniquePaths: num(r.unique_paths),
      viewsPerSession: sessions > 0 ? views / sessions : 0,
      pathRatio: views > 0 ? num(r.unique_paths) / views : 0,
      jsBeaconShare: sessions > 0 ? num(r.js_beacon_sessions) / sessions : 0,
      rules: (r.rules ? r.rules.split("+") : []).filter((s): s is FleetRule => s.length > 0),
      topPageType: r.top_page_type ?? "",
    };
  });
}

/** How many requests the proxy shed answered with a 429, and for which reason. */
export async function getShedReasons(range: TimeRange): Promise<ShedReasonStat[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT bot_type, count() AS views, uniq(path) AS unique_paths
    FROM page_views
    WHERE ${timeCondition} AND ${SHED_SQL}
    GROUP BY bot_type
    ORDER BY views DESC
  `);

  return rows.map((r) => ({
    botType: r.bot_type ?? "",
    label: SHED_REASON_LABELS[r.bot_type ?? ""] ?? (r.bot_type ?? ""),
    views: num(r.views),
    uniquePaths: num(r.unique_paths),
  }));
}

/** What the flagged fleets are actually hitting, by `page_type` and by path. */
export async function getFleetTargets(
  range: TimeRange,
  dimension: "page_type" | "path" = "page_type",
  limit = 10
): Promise<FleetTarget[]> {
  const timeCondition = getTimeRangeCondition(range);
  const windowHours = getWindowHours(range.days);
  const column = dimension === "path" ? "path" : "page_type";

  const rows = await query<Record<string, string>>(`
    ${buildPreamble(timeCondition, windowHours)}
    SELECT ${column} AS k, count() AS views, uniq(path) AS unique_paths
    FROM page_views
    WHERE ${timeCondition} AND ${UNCLASSIFIED_SQL} AND ${IN_FLEET_SQL}
    GROUP BY k
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    key: r.k || "(none)",
    views: num(r.views),
    uniquePaths: num(r.unique_paths),
  }));
}

/**
 * Investigative flags over the HUMAN pool. Deliberately NOT subtracted from any
 * human number — see the "not used as a filter" list in `fleet-scoring.ts`.
 */
export async function getAbuseFlags(range: TimeRange): Promise<AbuseFlags> {
  const timeCondition = getTimeRangeCondition(range);
  const windowHours = getWindowHours(range.days);

  const [row] = await query<Record<string, string>>(`
    ${buildPreamble(timeCondition, windowHours)}
    SELECT
      countIf(referer LIKE '%google.%') AS google_views,
      uniqIf(session_id, referer LIKE '%google.%') AS google_sessions,
      countIf(referer IS NULL OR referer = '') AS no_referer_views,
      uniqIf(session_id, session_id NOT IN js_sessions AND session_id != '') AS no_beacon_sessions,
      uniqIf(session_id, session_id != '') AS pool_sessions
    FROM page_views
    WHERE ${timeCondition} AND ${BUCKET_HUMAN}
  `);

  return {
    googleRefererViews: num(row?.google_views),
    googleRefererSessions: num(row?.google_sessions),
    noRefererViews: num(row?.no_referer_views),
    noBeaconSessions: num(row?.no_beacon_sessions),
    humanPoolSessions: num(row?.pool_sessions),
  };
}

// =============================================================================
// Verified crawlers
// =============================================================================

/**
 * Per-crawler crawl-budget report. `bot_type` is UA-derived, so a forged
 * Googlebot UA lands here too — the UI states that caveat rather than claiming
 * verification we do not perform (reverse-DNS is out of scope).
 */
export async function getVerifiedCrawlers(range: TimeRange, limit = 12): Promise<CrawlerStat[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT
      bot_type,
      count() AS views,
      uniq(path) AS unique_paths,
      uniq(toDate(timestamp)) AS active_days,
      topK(1)(page_type)[1] AS top_page_type
    FROM page_views
    WHERE ${timeCondition} AND ${VERIFIED_CRAWLER_SQL}
    GROUP BY bot_type
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    botType: r.bot_type ?? "",
    label: r.bot_type ?? "",
    views: num(r.views),
    uniquePaths: num(r.unique_paths),
    activeDays: num(r.active_days),
    topPageType: r.top_page_type ?? "",
  }));
}

/** Per-crawler volume over time, for the crawl-recovery trend. */
export async function getCrawlerTrend(
  range: TimeRange,
  granularity: AudienceGranularity = "day",
  topN = 5
): Promise<CrawlerTrendPoint[]> {
  const timeCondition = getTimeRangeCondition(range);
  const bucket = granularity === "hour" ? "toStartOfHour(timestamp)" : "toDate(timestamp)";

  const rows = await query<Record<string, string>>(`
    SELECT ${bucket} AS b, bot_type, count() AS views
    FROM page_views
    WHERE ${timeCondition} AND ${VERIFIED_CRAWLER_SQL}
      AND bot_type IN (
        SELECT bot_type FROM page_views
        WHERE ${timeCondition} AND ${VERIFIED_CRAWLER_SQL}
        GROUP BY bot_type ORDER BY count() DESC LIMIT ${topN}
      )
    GROUP BY b, bot_type
    ORDER BY b
  `);

  const byBucket = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = r.b;
    const existing = byBucket.get(key) ?? {};
    existing[r.bot_type ?? ""] = num(r.views);
    byBucket.set(key, existing);
  }

  return [...byBucket.entries()].map(([date, byCrawler]) => ({ date, byCrawler }));
}

/**
 * Bot types still SERVED (not shed, not a wanted crawler) — the shortlist for
 * the next shed rule. Uses the frozen ingest labels only, so it is cheap.
 */
export async function getServedBotTypes(range: TimeRange, limit = 10): Promise<ShedReasonStat[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT bot_type, count() AS views, uniq(path) AS unique_paths
    FROM page_views
    WHERE ${timeCondition} AND ${BOT_SQL} AND NOT ${VERIFIED_CRAWLER_SQL} AND NOT ${SHED_SQL}
      AND bot_type != ''
    GROUP BY bot_type
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    botType: r.bot_type ?? "",
    label: r.bot_type ?? "",
    views: num(r.views),
    uniquePaths: num(r.unique_paths),
  }));
}
