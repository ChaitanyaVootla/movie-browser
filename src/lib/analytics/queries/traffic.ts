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
  const sessionTimeCondition = getTimeRangeCondition(range, "started_at");
  // When "Human only" is on, scope the totals to the query-time human predicate
  // (see bot-filter.ts). Off = all traffic. botViews is always the bot count.
  const humanClause = humanOnly ? ` AND ${HUMAN_SQL}` : "";
  const sessionHumanClause = humanOnly ? " AND is_bot = 0" : "";

  const [result] = await query<{
    page_views: string;
    unique_sessions: string;
    unique_users: string;
    bot_views: string;
  }>(`
    SELECT
      count() AS page_views,
      uniq(session_id) AS unique_sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS unique_users,
      countIf(${BOT_SQL}) AS bot_views
    FROM page_views
    WHERE ${timeCondition}${humanClause}
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

  // Session metrics from sessions table
  const [sessionMetrics] = await query<{
    avg_duration: string;
    bounce_rate: string;
  }>(`
    SELECT
      avg(duration_seconds) AS avg_duration,
      countIf(bounce = 1) / count() AS bounce_rate
    FROM sessions
    WHERE ${sessionTimeCondition}
      AND duration_seconds > 0${sessionHumanClause}
  `);

  return {
    pageViews: parseInt(result?.page_views || "0", 10),
    uniqueSessions: parseInt(result?.unique_sessions || "0", 10),
    engagedSessions: parseInt(engaged?.engaged_sessions || "0", 10),
    uniqueUsers: parseInt(result?.unique_users || "0", 10),
    botViews: parseInt(result?.bot_views || "0", 10),
    avgSessionDuration: parseFloat(sessionMetrics?.avg_duration || "0"),
    bounceRate: parseFloat(sessionMetrics?.bounce_rate || "0"),
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
