/**
 * Traffic Analytics Queries
 *
 * Queries for page views, sessions, geographic distribution, and device breakdown.
 */

import { query } from "../client";
import { BOT_SQL, HUMAN_SQL } from "../bot-filter";
import {
  getTimeRangeCondition,
  type TimeRange,
  type TrafficOverview,
  type DailyTraffic,
  type DailyTrafficWithBots,
  type TopPage,
  type TopUserAgent,
  type GeoDistribution,
  type DeviceBreakdown,
} from "./types";

// =============================================================================
// Visit Sessionization
// =============================================================================

/**
 * Inactivity gap that ends a visit, in seconds (the industry-standard 30 min,
 * matching `SESSION_TIMEOUT_MS` in `../session.ts`).
 */
export const VISIT_GAP_SECONDS = 30 * 60;

/**
 * SQL for per-visit metrics (duration + pageview count) derived from
 * `page_views`.
 *
 * WHY NOT THE `sessions` TABLE: nothing ever writes it. `trackSessionStart` /
 * `trackSessionEnd` exist in `../track.ts` but have no callers, so
 * `analytics.sessions` has been empty since day one — the old
 * `avg(duration_seconds)` / `countIf(bounce = 1)` query over it always returned
 * NULL, which is why the dashboard's Avg Duration and Bounce Rate rendered a
 * permanent "—". `page_views` has `session_id` + `timestamp`, which is all these
 * metrics need.
 *
 * WHY SESSIONIZE: `session_id` is a fingerprint hash of IP + UA +
 * Accept-Language (`../session.ts`), NOT a per-visit cookie, so one id recurs
 * for days. `max(timestamp) - min(timestamp)` per id therefore measures how long
 * we have SEEN a visitor, not how long a visit lasted (measured on prod: 11h
 * "average", 6.5-day maximum). Rows are split into visits on a
 * `VISIT_GAP_SECONDS` inactivity gap instead. `lagInFrame`'s zero default on the
 * first row of each partition yields a huge gap, which correctly opens visit 1.
 *
 * Always scoped to human rows (`HUMAN_SQL`): a bot's "visit duration" is
 * meaningless, and the CloudFront origin-fetch pseudo-session alone carries
 * ~24k views/day, which would swamp the average and make the window functions
 * scan millions of rows.
 */
export function buildVisitMetricsSql(timeCondition: string): string {
  return `
    SELECT
      count() AS visits,
      countIf(views = 1) AS bounces,
      avg(duration) AS avg_duration
    FROM (
      SELECT
        count() AS views,
        dateDiff('second', min(timestamp), max(timestamp)) AS duration
      FROM (
        SELECT
          session_id,
          timestamp,
          sum(is_new_visit) OVER (
            PARTITION BY session_id ORDER BY timestamp
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS visit_no
        FROM (
          SELECT
            session_id,
            timestamp,
            dateDiff(
              'second',
              lagInFrame(timestamp) OVER (
                PARTITION BY session_id ORDER BY timestamp
                ROWS BETWEEN 1 PRECEDING AND CURRENT ROW
              ),
              timestamp
            ) > ${VISIT_GAP_SECONDS} AS is_new_visit
          FROM page_views
          WHERE ${timeCondition} AND ${HUMAN_SQL} AND session_id != ''
        )
      )
      GROUP BY session_id, visit_no
    )
  `;
}

// =============================================================================
// Traffic Overview
// =============================================================================

/**
 * Get traffic overview metrics
 */
export async function getTrafficOverview(
  range: TimeRange,
  humanOnly = false
): Promise<TrafficOverview> {
  const timeCondition = getTimeRangeCondition(range);
  // When "Human only" is on, scope the totals to the query-time human predicate
  // (see bot-filter.ts). Off = all traffic. `bot_views` must be counted OUTSIDE
  // that scope — it used to live in a WHERE that already excluded bots, so the
  // dashboard's "Bot Traffic" read 0 views whenever the toggle was on.
  const scope = humanOnly ? HUMAN_SQL : "1";

  const [result] = await query<{
    page_views: string;
    unique_sessions: string;
    unique_users: string;
    bot_views: string;
  }>(`
    SELECT
      countIf(${scope}) AS page_views,
      uniqIf(session_id, ${scope}) AS unique_sessions,
      uniqIf(user_id, user_id IS NOT NULL AND ${scope}) AS unique_users,
      countIf(${BOT_SQL}) AS bot_views
    FROM page_views
    WHERE ${timeCondition}
  `);

  // Engaged sessions: 2+ pageviews, an authenticated user, or any user action.
  // Sophisticated scrapers forge UA + sec-ch-ua and pass is_bot=0, but they
  // surf with rotating IPs at exactly one pageview per session — engagement is
  // the signal they can't fake cheaply. (Post-GA June 2026: ~97% of "human"
  // sessions were such bots.)
  const [engaged] = await query<{ engaged_sessions: string }>(`
    SELECT uniq(session_id) AS engaged_sessions
    FROM (
      SELECT session_id, count() AS views, max(is_authenticated) AS authed
      FROM page_views
      WHERE ${HUMAN_SQL} AND ${timeCondition}
      GROUP BY session_id
      HAVING views >= 2 OR authed = 1
        OR session_id IN (SELECT session_id FROM user_actions WHERE is_bot = 0 AND ${timeCondition})
    )
  `);

  // Visit duration + bounce rate, sessionized from page_views (see
  // buildVisitMetricsSql for why the `sessions` table can't provide these).
  const [visitMetrics] = await query<{
    visits: string;
    bounces: string;
    avg_duration: string;
  }>(buildVisitMetricsSql(timeCondition));

  const visits = parseInt(visitMetrics?.visits || "0", 10);
  const bounces = parseInt(visitMetrics?.bounces || "0", 10);

  return {
    pageViews: parseInt(result?.page_views || "0", 10),
    uniqueSessions: parseInt(result?.unique_sessions || "0", 10),
    engagedSessions: parseInt(engaged?.engaged_sessions || "0", 10),
    uniqueUsers: parseInt(result?.unique_users || "0", 10),
    botViews: parseInt(result?.bot_views || "0", 10),
    visits,
    avgSessionDuration: parseFloat(visitMetrics?.avg_duration || "0"),
    bounceRate: visits > 0 ? bounces / visits : 0,
  };
}

// =============================================================================
// Traffic Granularity Types
// =============================================================================

export type TrafficGranularity = "hour" | "day";

export interface HourlyTraffic {
  timestamp: string;
  pageViews: number;
  sessions: number;
  users: number;
}

export interface HourlyTrafficWithBots {
  date: string; // Using 'date' for consistency with DailyTrafficWithBots
  humanViews: number;
  botViews: number;
}

// =============================================================================
// Daily Traffic
// =============================================================================

/**
 * Get daily traffic over time
 */
export async function getDailyTraffic(range: TimeRange, humanOnly = false): Promise<DailyTraffic[]> {
  const timeCondition = getTimeRangeCondition(range);
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";

  const rows = await query<{
    date: string;
    page_views: string;
    sessions: string;
    users: string;
  }>(`
    SELECT
      toDate(timestamp) AS date,
      count() AS page_views,
      uniq(session_id) AS sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS users
    FROM page_views
    WHERE ${timeCondition}${humanClause}
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    pageViews: parseInt(row.page_views, 10),
    sessions: parseInt(row.sessions, 10),
    users: parseInt(row.users, 10),
  }));
}

/**
 * Get hourly traffic over time (for finer granularity)
 */
export async function getHourlyTraffic(range: TimeRange, humanOnly = false): Promise<HourlyTraffic[]> {
  const timeCondition = getTimeRangeCondition(range);
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";

  const rows = await query<{
    ts: string;
    page_views: string;
    sessions: string;
    users: string;
  }>(`
    SELECT
      toStartOfHour(timestamp) AS ts,
      count() AS page_views,
      uniq(session_id) AS sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS users
    FROM page_views
    WHERE ${timeCondition}${humanClause}
    GROUP BY ts
    ORDER BY ts
  `);

  return rows.map((row) => ({
    timestamp: row.ts,
    pageViews: parseInt(row.page_views, 10),
    sessions: parseInt(row.sessions, 10),
    users: parseInt(row.users, 10),
  }));
}

/**
 * Get traffic with configurable granularity
 */
export async function getTrafficTrend(
  range: TimeRange,
  granularity: TrafficGranularity = "day"
): Promise<(DailyTraffic | HourlyTraffic)[]> {
  if (granularity === "hour") {
    return getHourlyTraffic(range);
  }
  return getDailyTraffic(range);
}

/**
 * Get daily traffic with bot breakdown (for comparison chart)
 */
export async function getDailyTrafficWithBots(range: TimeRange): Promise<DailyTrafficWithBots[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    date: string;
    human_views: string;
    bot_views: string;
  }>(`
    SELECT
      toDate(timestamp) AS date,
      countIf(${HUMAN_SQL}) AS human_views,
      countIf(${BOT_SQL}) AS bot_views
    FROM page_views
    WHERE ${timeCondition}
    GROUP BY date
    ORDER BY date
  `);

  return rows.map((row) => ({
    date: row.date,
    humanViews: parseInt(row.human_views, 10),
    botViews: parseInt(row.bot_views, 10),
  }));
}

/**
 * Get hourly traffic with bot breakdown (for finer granularity)
 */
export async function getHourlyTrafficWithBots(range: TimeRange): Promise<HourlyTrafficWithBots[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    ts: string;
    human_views: string;
    bot_views: string;
  }>(`
    SELECT
      toStartOfHour(timestamp) AS ts,
      countIf(${HUMAN_SQL}) AS human_views,
      countIf(${BOT_SQL}) AS bot_views
    FROM page_views
    WHERE ${timeCondition}
    GROUP BY ts
    ORDER BY ts
  `);

  return rows.map((row) => ({
    date: row.ts, // Use 'date' for consistency with DailyTrafficWithBots
    humanViews: parseInt(row.human_views, 10),
    botViews: parseInt(row.bot_views, 10),
  }));
}

/**
 * Get traffic with bots, configurable granularity
 */
export async function getTrafficWithBotsTrend(
  range: TimeRange,
  granularity: TrafficGranularity = "day"
): Promise<(DailyTrafficWithBots | HourlyTrafficWithBots)[]> {
  if (granularity === "hour") {
    return getHourlyTrafficWithBots(range);
  }
  return getDailyTrafficWithBots(range);
}

// =============================================================================
// Top Pages
// =============================================================================

/**
 * Get top pages by views (includes both human and bot views for filtering)
 */
export async function getTopPages(
  range: TimeRange,
  limit = 20,
  humanOnly = false
): Promise<TopPage[]> {
  const timeCondition = getTimeRangeCondition(range);
  // When human-only, drop bot-only pages entirely; otherwise rank all pages but
  // always return the human/bot split so the client can label + filter.
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";

  const rows = await query<{
    path: string;
    page_type: string;
    human_views: string;
    bot_views: string;
    unique_visitors: string;
  }>(`
    SELECT
      path,
      page_type,
      countIf(${HUMAN_SQL}) AS human_views,
      countIf(${BOT_SQL}) AS bot_views,
      uniqIf(session_id, ${HUMAN_SQL}) AS unique_visitors
    FROM page_views
    WHERE ${timeCondition}${humanClause}
    GROUP BY path, page_type
    ORDER BY human_views DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    path: row.path,
    pageType: row.page_type,
    views: parseInt(row.human_views, 10),
    uniqueVisitors: parseInt(row.unique_visitors, 10),
    botViews: parseInt(row.bot_views, 10),
  }));
}

// =============================================================================
// Geographic & Device Distribution
// =============================================================================

/**
 * Get geographic distribution of traffic
 */
export async function getGeoDistribution(
  range: TimeRange,
  limit = 15,
  humanOnly = false
): Promise<GeoDistribution[]> {
  const timeCondition = getTimeRangeCondition(range);
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";

  const rows = await query<{
    country: string;
    views: string;
  }>(`
    SELECT
      country,
      count() AS views
    FROM page_views
    WHERE ${timeCondition}${humanClause}
    GROUP BY country
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  const total = rows.reduce((sum, row) => sum + parseInt(row.views, 10), 0);

  return rows.map((row) => ({
    country: row.country,
    views: parseInt(row.views, 10),
    percentage: total > 0 ? (parseInt(row.views, 10) / total) * 100 : 0,
  }));
}

/**
 * Get device type breakdown
 */
export async function getDeviceBreakdown(
  range: TimeRange,
  humanOnly = false
): Promise<DeviceBreakdown[]> {
  const timeCondition = getTimeRangeCondition(range);
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";

  const rows = await query<{
    device_type: string;
    count: string;
  }>(`
    SELECT
      device_type,
      count() AS count
    FROM page_views
    WHERE ${timeCondition}${humanClause}
    GROUP BY device_type
    ORDER BY count DESC
  `);

  const total = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);

  return rows.map((row) => ({
    deviceType: row.device_type,
    count: parseInt(row.count, 10),
    percentage: total > 0 ? (parseInt(row.count, 10) / total) * 100 : 0,
  }));
}

// =============================================================================
// Top Bot Sources
// =============================================================================

export interface BotSource {
  botType: string;
  views: number;
  percentage: number;
}

export async function getTopBotSources(range: TimeRange, limit = 10): Promise<BotSource[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    bot_type: string;
    views: string;
  }>(`
    SELECT
      bot_type,
      count() AS views
    FROM page_views
    WHERE ${timeCondition} AND ${BOT_SQL} AND bot_type != ''
    GROUP BY bot_type
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  const total = rows.reduce((acc, r) => acc + parseInt(r.views, 10), 0);

  return rows.map((row) => ({
    botType: row.bot_type,
    views: parseInt(row.views, 10),
    percentage: total > 0 ? parseInt(row.views, 10) / total : 0,
  }));
}

// =============================================================================
// Top Bot User Agents
// =============================================================================

/**
 * Top raw User-Agent strings among bot traffic (by the query-time BOT_SQL
 * predicate). Surfaces exactly which agents drive load — including any that slip
 * past the ingest `is_bot` flag (e.g. "Amazon CloudFront") so we know what to
 * add to bot-filter.ts next.
 */
export async function getTopUserAgents(range: TimeRange, limit = 10): Promise<TopUserAgent[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<{
    user_agent: string;
    bot_type: string;
    views: string;
  }>(`
    SELECT
      user_agent,
      any(bot_type) AS bot_type,
      count() AS views
    FROM page_views
    WHERE ${timeCondition} AND ${BOT_SQL} AND user_agent != ''
    GROUP BY user_agent
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  const total = rows.reduce((acc, r) => acc + parseInt(r.views, 10), 0);

  return rows.map((row) => ({
    userAgent: row.user_agent,
    botType: row.bot_type,
    views: parseInt(row.views, 10),
    percentage: total > 0 ? (parseInt(row.views, 10) / total) * 100 : 0,
  }));
}
