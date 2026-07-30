/**
 * Agent-layer queries — who consumes the LLM-friendly surfaces, and how.
 *
 * The LLM-friendly layer (`.claude/rules/llm-friendly.md`) is the `.md` page
 * twins plus their `/llms.txt` discovery index. It exists as a COST LEVER: a
 * `.md` request is one read-only Postgres query with no SSR, no enrichment and
 * no ratings Lambda, so steering bulk agents onto it is much cheaper than
 * serving them HTML. That only pays off if we can see whether they actually use
 * it — which nothing surfaced before this module.
 *
 * TWO HONESTY CONSTRAINTS, both printed on the panel that renders this:
 *
 *  1. Every count here is ORIGIN-OBSERVED. Tracking happens in `src/proxy.ts`,
 *     which runs at the origin, while `.md` responses carry `s-maxage=86400`.
 *     So these are CDN cache MISSES; a repeat fetch of the same path inside the
 *     TTL is served at the edge and never counted. In practice the undercount is
 *     small for `.md` (unique paths ≈ requests — the consumers are enumerating a
 *     long tail, not re-reading), which is itself the finding.
 *  2. Attribution before 28 Jul 2026 is unusable. CloudFront did not forward the
 *     viewer User-Agent until then, so every agent was recorded as
 *     `Amazon CloudFront` with `is_bot=0` — i.e. this traffic counted as HUMAN in
 *     `page_views` for the layer's first ~12 days. Same caveat as the Crawlers
 *     panel; see the traffic memories.
 */

import { query } from "../client";
import { getTimeRangeCondition, type TimeRange } from "./types";

// =============================================================================
// Types
// =============================================================================

export type LlmSurface = "md" | "llms_txt";

export interface LlmLayerOverview {
  /** Origin-observed requests for `.md` twins. */
  mdRequests: number;
  /** Distinct `.md` paths requested. */
  mdUniquePaths: number;
  /** Distinct fingerprint sessions that requested any `.md`. */
  mdSessions: number;
  /** Origin-observed requests for `/llms.txt`. */
  llmsTxtRequests: number;
  /** Distinct sessions that fetched `/llms.txt`. */
  llmsTxtSessions: number;
  /** `.md` requests whose row is flagged `is_bot`. */
  botRequests: number;
  /** Distinct `user_agent` strings seen on the layer. */
  distinctAgents: number;
  /**
   * `mdRequests / mdUniquePaths`. 1.0 = every request was a different URL, i.e.
   * pure enumeration with NO edge-cache reuse, so essentially every hit reached
   * Postgres. Materially above 1.0 = the edge is absorbing repeats.
   */
  requestsPerPath: number;
}

export interface LlmLayerTrendPoint {
  date: string;
  mdRequests: number;
  mdUniquePaths: number;
  llmsTxtRequests: number;
}

export interface LlmConsumer {
  userAgent: string;
  /** Ingest-time `bot_type`, or "" when the request was classified human. */
  botType: string;
  requests: number;
  uniquePaths: number;
  sessions: number;
  /** Whether this consumer ever fetched `/llms.txt` — i.e. used the index. */
  usedIndex: boolean;
  /** Most-requested surface kind for this consumer (movie / person / …). */
  topTarget: string;
  activeDays: number;
}

export interface LlmTargetStat {
  /** Surface kind: movie, series, person, topic, browse, search, llms.txt, … */
  target: string;
  requests: number;
  uniquePaths: number;
}

export interface LlmLayerData {
  overview: LlmLayerOverview;
  trend: LlmLayerTrendPoint[];
  consumers: LlmConsumer[];
  targets: LlmTargetStat[];
}

// =============================================================================
// Shared SQL
// =============================================================================

/**
 * A request belonging to the LLM-friendly layer.
 *
 * Path-based rather than a dedicated column on purpose: `page_type` is derived
 * by `getPageTypeFromPath`, which knows nothing about the `.md` suffix, so a
 * `.md` twin is already stored with its underlying type (movie / person / …).
 * That is worth KEEPING — it is what lets `LLM_TARGET_SQL` below break the layer
 * down by content kind — so the suffix is matched here instead of flattening
 * every twin into one `page_type` and losing that dimension. No schema change,
 * and it works retroactively over all existing rows.
 */
export const LLM_LAYER_SQL = "(path LIKE '%.md' OR path = '/llms.txt')";

/** Just the markdown twins, excluding the index. */
export const LLM_MD_SQL = "(path LIKE '%.md')";

/**
 * Surface kind for a layer row. `page_type` already carries movie/series/person/
 * browse/search for the twins, so this only special-cases the index itself and
 * normalises ClickHouse's empty-string default to something readable.
 */
const LLM_TARGET_SQL = `multiIf(
  path = '/llms.txt', 'llms.txt',
  page_type = '', 'unknown',
  page_type
)`;

const num = (v: string | undefined): number => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// =============================================================================
// Overview
// =============================================================================

export async function getLlmLayerOverview(range: TimeRange): Promise<LlmLayerOverview> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT
      countIf(${LLM_MD_SQL}) AS md_requests,
      uniqIf(path, ${LLM_MD_SQL}) AS md_unique_paths,
      uniqIf(session_id, ${LLM_MD_SQL}) AS md_sessions,
      countIf(path = '/llms.txt') AS llms_txt_requests,
      uniqIf(session_id, path = '/llms.txt') AS llms_txt_sessions,
      countIf(${LLM_MD_SQL} AND is_bot = 1) AS bot_requests,
      uniq(user_agent) AS distinct_agents
    FROM page_views
    WHERE ${timeCondition} AND ${LLM_LAYER_SQL}
  `);

  const r = rows[0] ?? {};
  const mdRequests = num(r.md_requests);
  const mdUniquePaths = num(r.md_unique_paths);

  return {
    mdRequests,
    mdUniquePaths,
    mdSessions: num(r.md_sessions),
    llmsTxtRequests: num(r.llms_txt_requests),
    llmsTxtSessions: num(r.llms_txt_sessions),
    botRequests: num(r.bot_requests),
    distinctAgents: num(r.distinct_agents),
    requestsPerPath: mdUniquePaths > 0 ? mdRequests / mdUniquePaths : 0,
  };
}

// =============================================================================
// Trend
// =============================================================================

/**
 * Volume over time. `mdUniquePaths` is charted alongside `mdRequests` because
 * the GAP between them is the edge-cache-reuse signal — two lines that sit on
 * top of each other mean every request was a distinct URL.
 */
export async function getLlmLayerTrend(
  range: TimeRange,
  granularity: "hour" | "day" = "day"
): Promise<LlmLayerTrendPoint[]> {
  const timeCondition = getTimeRangeCondition(range);
  const bucket = granularity === "hour" ? "toStartOfHour(timestamp)" : "toDate(timestamp)";

  const rows = await query<Record<string, string>>(`
    SELECT
      ${bucket} AS b,
      countIf(${LLM_MD_SQL}) AS md_requests,
      uniqIf(path, ${LLM_MD_SQL}) AS md_unique_paths,
      countIf(path = '/llms.txt') AS llms_txt_requests
    FROM page_views
    WHERE ${timeCondition} AND ${LLM_LAYER_SQL}
    GROUP BY b
    ORDER BY b
  `);

  return rows.map((r) => ({
    date: r.b ?? "",
    mdRequests: num(r.md_requests),
    mdUniquePaths: num(r.md_unique_paths),
    llmsTxtRequests: num(r.llms_txt_requests),
  }));
}

// =============================================================================
// Consumers
// =============================================================================

/**
 * Per-User-Agent consumption — the panel's headline table, and the answer to
 * "which agents actually use this and which are just scraping it".
 *
 * Grouped by the raw `user_agent` rather than `bot_type` deliberately: several
 * distinct consumers collapse into the same coarse label (`generic_bot`,
 * `crawler`), and telling `Claude-SearchBot` apart from an unlabelled Chrome-UA
 * scraper is the entire point. `bot_type` is carried along as a secondary column
 * so the shed's verdict stays visible.
 */
export async function getLlmLayerConsumers(
  range: TimeRange,
  limit = 20
): Promise<LlmConsumer[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT
      user_agent,
      topK(1)(bot_type)[1] AS bot_type,
      count() AS requests,
      uniq(path) AS unique_paths,
      uniq(session_id) AS sessions,
      countIf(path = '/llms.txt') > 0 AS used_index,
      topK(1)(${LLM_TARGET_SQL})[1] AS top_target,
      uniq(toDate(timestamp)) AS active_days
    FROM page_views
    WHERE ${timeCondition} AND ${LLM_LAYER_SQL}
    GROUP BY user_agent
    ORDER BY requests DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    userAgent: r.user_agent ?? "",
    botType: r.bot_type ?? "",
    requests: num(r.requests),
    uniquePaths: num(r.unique_paths),
    sessions: num(r.sessions),
    usedIndex: num(r.used_index) === 1,
    topTarget: r.top_target ?? "",
    activeDays: num(r.active_days),
  }));
}

// =============================================================================
// Targets
// =============================================================================

/** Which surface kinds the layer's traffic goes to. */
export async function getLlmLayerTargets(range: TimeRange): Promise<LlmTargetStat[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string>>(`
    SELECT
      ${LLM_TARGET_SQL} AS target,
      count() AS requests,
      uniq(path) AS unique_paths
    FROM page_views
    WHERE ${timeCondition} AND ${LLM_LAYER_SQL}
    GROUP BY target
    ORDER BY requests DESC
  `);

  return rows.map((r) => ({
    target: r.target ?? "",
    requests: num(r.requests),
    uniquePaths: num(r.unique_paths),
  }));
}
