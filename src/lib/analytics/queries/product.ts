/**
 * Product analytics — is the product actually being USED?
 *
 * Everything the dashboard measured before this module was either the SYSTEM
 * (cost, Lambda, CPU, cache) or the AUDIENCE (who is arriving). Nothing answered
 * whether arrivals turn into use. The data to answer it was already being
 * collected and simply never rendered — see
 * `docs/superpowers/specs/2026-08-14-admin-analytics-overhaul-design.md` §4 Phase 1.
 *
 * THE DENOMINATOR PROBLEM, and why every query here is session-scoped.
 * `session_id` is `hash(IP + UA + Accept-Language)` (`session.ts`) with no cookie
 * and no round-trip requirement, so a fleet rotating residential IPs mints a free
 * identity per IP: 3,794,346 distinct ids at 1.20 views each over three days,
 * against 59.67 for authenticated humans. Any conversion rate computed against
 * raw `page_views` inherits that inflation.
 *
 * `HUMAN_SQL` (`bot-filter.ts`) is NOT sufficient here either. It is a per-row UA
 * and referer predicate, and the current fleets forge both — measured directly
 * while building this module: the top titles by `HUMAN_SQL`-scoped views over 30
 * days were empty per-episode discussion shells (`Tagesschau S48E255` at 9,525
 * views with ZERO actions of any kind), i.e. the Aug 3 crawl surface, not content
 * anyone watched.
 *
 * So the scope used throughout is the spec's **confirmed-human floor**
 * (`confirmedHumanViewerSql`): a session is confirmed human if it is
 * AUTHENTICATED or it performed a tracked `user_actions` event. That is the same
 * definition the audience panel already reports as its hard floor — it is
 * deliberately NOT a new human definition (invariant: "do not invent one"). It
 * undercounts real people who only read, and the panel says so; what it buys is
 * that a conversion RATE has a denominator a bot cannot inflate, because entering
 * the denominator at all requires a client-side interaction.
 *
 * Measured effect of that choice, same window, same table: top titles become
 * `KATSEYE: WILD HEARTS`, `Spider-Man: Brand New Day`, `Musafir Cafe` — real
 * titles with real actions against them.
 *
 * COST. ClickHouse is capped at 0.9 of 2 vCPU on this box, so the three
 * `page_views`-scanning queries here are meant to be awaited SEQUENTIALLY by the
 * API route, never in a `Promise.all`. Measured on prod: ~0.9s each at 7 days,
 * ~2.3s each at 30 days. Folding them into one statement was tried and REJECTED —
 * ClickHouse inlines CTEs rather than materializing them, so a `UNION ALL` over a
 * shared CTE re-evaluated the expensive scan and cost 4.5s, exactly the same as
 * running the queries separately. Keep them separate and readable.
 */

import { query } from "../client";
import { getTimeRangeCondition, type TimeRange } from "./types";

// =============================================================================
// Scope predicates
// =============================================================================

/**
 * The six per-title conversion actions computed by `getItemAnalytics` for a
 * single item. This module is the cross-catalog view of the same six.
 *
 * Kept as a literal list rather than "every action" on purpose: these are the
 * ones that express intent toward a TITLE (want to watch it / rate it / go watch
 * it / sample it). Navigation chrome (`carousel_nav`, `gallery_nav`) also carries
 * an `item_id` and would otherwise dominate every count without meaning anything
 * about the title.
 */
export const CONVERSION_ACTIONS = [
  "watchlist_add",
  "watchlist_remove",
  "rate_like",
  "rate_dislike",
  "watch_click",
  "trailer_play",
] as const;

const CONVERSION_ACTION_SQL = CONVERSION_ACTIONS.map((a) => `'${a}'`).join(", ");

/**
 * Sessions that performed at least one tracked action in the window.
 *
 * `user_actions` has an `is_bot` column but NO `user_agent` column (schema quirk
 * from the no-migrations era), so `is_bot = 0` is the only filter available on
 * it — `HUMAN_SQL` cannot be applied here and must not be pasted in.
 */
export function actingSessionSql(range: TimeRange): string {
  const timeCondition = getTimeRangeCondition(range);
  return `SELECT session_id FROM user_actions
          WHERE ${timeCondition} AND is_bot = 0 AND session_id != ''`;
}

/**
 * The confirmed-human floor as a `page_views` / `performance` row predicate:
 * the row's session is authenticated, or it acted at least once.
 *
 * `performance` has no `is_authenticated` column, so callers against that table
 * must pass `hasAuthColumn: false` and accept the acting-session half only.
 */
export function confirmedHumanViewerSql(range: TimeRange, hasAuthColumn = true): string {
  const acted = `session_id IN (${actingSessionSql(range)})`;
  return hasAuthColumn ? `(is_authenticated = 1 OR ${acted})` : `(${acted})`;
}

// =============================================================================
// Types
// =============================================================================

export interface ProductOverview {
  /** Sessions meeting the confirmed-human floor (authenticated OR acted). */
  confirmedSessions: number;
  /** Page views belonging to those sessions. */
  confirmedViews: number;
  /** Of those, views of a movie/series/person page. */
  confirmedItemViews: number;
  /** Views by an authenticated session. */
  authedViews: number;
  /** All tracked actions in the window (`user_actions`, `is_bot = 0`). */
  totalActions: number;
  /** Sessions that performed at least one action. */
  actingSessions: number;
  /** Signed-in users who performed at least one action. */
  actingUsers: number;
  /** Distinct titles with at least one of the six conversion actions. */
  titlesActedOn: number;
}

/** One title's view→action funnel. All counts are for the requested window. */
export interface TitleConversion {
  itemId: number;
  title: string;
  mediaType: string;
  /** Confirmed-human views of the title's page. May be 0 (see `conversionRate`). */
  views: number;
  /** Distinct confirmed-human sessions that viewed it. */
  visitors: number;
  /** Distinct sessions that performed one of the six actions on it. */
  actingSessions: number;
  totalActions: number;
  watchlistAdds: number;
  watchlistRemoves: number;
  ratingLikes: number;
  ratingDislikes: number;
  watchClicks: number;
  trailerPlays: number;
}

/** A title ranked by confirmed-human views. */
export interface TopTitle {
  itemId: number;
  title: string;
  mediaType: string;
  views: number;
  visitors: number;
}

/** Core Web Vitals for one page type, scoped to confirmed-human sessions. */
export interface HumanPageTypePerformance {
  pageType: string;
  samples: number;
  p75Lcp: number;
  p75Cls: number;
  p75Ttfb: number;
  p75Inp: number | null;
}

// =============================================================================
// Coercion
// =============================================================================

/**
 * ClickHouse returns every numeric as a STRING under `FORMAT JSON`, and a
 * quantile over an empty group comes back as `null`. Both collapse to 0 here.
 */
const num = (v: string | null | undefined): number => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Same, but preserves a genuinely absent metric as `null` rather than a fake 0. */
const nullableNum = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
};

// =============================================================================
// Pure helpers
// =============================================================================

/**
 * Share of a title's confirmed-human visitors who acted on it, as a percentage.
 *
 * Returns `null` — never 0 — when there is no denominator, because the two cases
 * are different facts and rendering them the same is the "more confident than the
 * data supports" failure the spec forbids. `visitors` can legitimately be 0 while
 * `actingSessions` is not: `page_views` is written by the proxy at the ORIGIN, so
 * a CloudFront edge HIT records no view, while the action's client beacon still
 * arrives. Such a row is real engagement with an unknown denominator.
 *
 * Not clamped to 100: a rate above 100% is itself the signal that the view rows
 * are missing (edge-served), and hiding it would hide that.
 */
export function conversionRate(actingSessions: number, visitors: number): number | null {
  if (visitors <= 0) return null;
  return (actingSessions / visitors) * 100;
}

// =============================================================================
// Overview
// =============================================================================

/**
 * The honest denominator for the whole panel, plus the action totals.
 *
 * Two scans: one over `page_views` for the confirmed-human floor, one over the
 * (small) `user_actions` table.
 */
export async function getProductOverview(range: TimeRange): Promise<ProductOverview> {
  const timeCondition = getTimeRangeCondition(range);

  const [views] = await query<Record<string, string | null>>(`
    SELECT
      uniq(session_id) AS confirmed_sessions,
      count() AS confirmed_views,
      countIf(item_id IS NOT NULL) AS confirmed_item_views,
      countIf(is_authenticated = 1) AS authed_views
    FROM page_views
    WHERE ${timeCondition} AND ${confirmedHumanViewerSql(range)}
  `);

  const [actions] = await query<Record<string, string | null>>(`
    SELECT
      count() AS total_actions,
      uniq(session_id) AS acting_sessions,
      uniqIf(user_id, user_id IS NOT NULL) AS acting_users,
      uniqExactIf(item_id, item_id IS NOT NULL AND action IN (${CONVERSION_ACTION_SQL}))
        AS titles_acted_on
    FROM user_actions
    WHERE ${timeCondition} AND is_bot = 0
  `);

  return {
    confirmedSessions: num(views?.confirmed_sessions),
    confirmedViews: num(views?.confirmed_views),
    confirmedItemViews: num(views?.confirmed_item_views),
    authedViews: num(views?.authed_views),
    totalActions: num(actions?.total_actions),
    actingSessions: num(actions?.acting_sessions),
    actingUsers: num(actions?.acting_users),
    titlesActedOn: num(actions?.titles_acted_on),
  };
}

// =============================================================================
// Per-title conversion
// =============================================================================

/**
 * Titles ranked by how much people ACTED on them, with the confirmed-human view
 * count as the denominator.
 *
 * Ranked by actions rather than views deliberately. Ranking by views answers
 * "what did crawlers fetch"; ranking by actions answers "what did people engage
 * with", which is the question the panel exists for — and it is the ordering that
 * makes the six `getItemAnalytics` metrics legible for the first time.
 *
 * `title` prefers the `page_views` value over the `user_actions` one: a
 * `trailer_play` event carries the VIDEO's title (measured on prod:
 * "She blackmails him to be her bodyguard…" for the series `Fight Dirty`), so
 * taking the action-side title first would mislabel rows.
 */
export async function getTitleConversion(
  range: TimeRange,
  limit = 12
): Promise<TitleConversion[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string | null>>(`
    WITH acts AS (
      SELECT
        item_id,
        any(item_title) AS action_title,
        any(media_type) AS action_media_type,
        countIf(action = 'watchlist_add') AS watchlist_adds,
        countIf(action = 'watchlist_remove') AS watchlist_removes,
        countIf(action = 'rate_like') AS rating_likes,
        countIf(action = 'rate_dislike') AS rating_dislikes,
        countIf(action = 'watch_click') AS watch_clicks,
        countIf(action = 'trailer_play') AS trailer_plays,
        count() AS total_actions,
        uniq(session_id) AS acting_sessions
      FROM user_actions
      WHERE ${timeCondition}
        AND is_bot = 0
        AND item_id IS NOT NULL
        AND action IN (${CONVERSION_ACTION_SQL})
      GROUP BY item_id
      ORDER BY total_actions DESC
      LIMIT ${limit}
    ),
    views AS (
      SELECT
        item_id,
        any(item_title) AS view_title,
        any(item_media_type) AS view_media_type,
        count() AS views,
        uniq(session_id) AS visitors
      FROM page_views
      WHERE ${timeCondition}
        AND item_id IS NOT NULL
        AND ${confirmedHumanViewerSql(range)}
      GROUP BY item_id
    )
    SELECT
      a.item_id AS item_id,
      coalesce(nullIf(v.view_title, ''), nullIf(a.action_title, ''), '') AS title,
      coalesce(nullIf(v.view_media_type, ''), nullIf(a.action_media_type, ''), '') AS media_type,
      ifNull(v.views, 0) AS views,
      ifNull(v.visitors, 0) AS visitors,
      a.acting_sessions AS acting_sessions,
      a.total_actions AS total_actions,
      a.watchlist_adds AS watchlist_adds,
      a.watchlist_removes AS watchlist_removes,
      a.rating_likes AS rating_likes,
      a.rating_dislikes AS rating_dislikes,
      a.watch_clicks AS watch_clicks,
      a.trailer_plays AS trailer_plays
    FROM acts a
    LEFT JOIN views v ON v.item_id = a.item_id
    ORDER BY total_actions DESC, views DESC
  `);

  return rows.map((r) => ({
    itemId: num(r.item_id),
    title: r.title || `ID: ${num(r.item_id)}`,
    mediaType: r.media_type ?? "",
    views: num(r.views),
    visitors: num(r.visitors),
    actingSessions: num(r.acting_sessions),
    totalActions: num(r.total_actions),
    watchlistAdds: num(r.watchlist_adds),
    watchlistRemoves: num(r.watchlist_removes),
    ratingLikes: num(r.rating_likes),
    ratingDislikes: num(r.rating_dislikes),
    watchClicks: num(r.watch_clicks),
    trailerPlays: num(r.trailer_plays),
  }));
}

// =============================================================================
// Top titles
// =============================================================================

/**
 * Most-viewed titles among confirmed humans.
 *
 * The confirmed-human scope is what separates this from `getTopContent`
 * (`queries/content.ts`), which filters on `is_bot = 0` alone. That function is
 * left alone rather than changed — it has other callers and its own contract —
 * but it is NOT what this panel renders: measured on the same 30-day window, its
 * top rows were empty per-episode discussion shells with zero actions, because
 * the fleet forges the UA and referer that `is_bot`/`HUMAN_SQL` key on.
 */
export async function getTopTitles(range: TimeRange, limit = 20): Promise<TopTitle[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string | null>>(`
    SELECT
      item_id,
      any(item_title) AS title,
      any(item_media_type) AS media_type,
      count() AS views,
      uniq(session_id) AS visitors
    FROM page_views
    WHERE ${timeCondition}
      AND item_id IS NOT NULL
      AND ${confirmedHumanViewerSql(range)}
    GROUP BY item_id
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    itemId: num(r.item_id),
    title: r.title || `ID: ${num(r.item_id)}`,
    mediaType: r.media_type ?? "",
    views: num(r.views),
    visitors: num(r.visitors),
  }));
}

// =============================================================================
// Human-scoped performance
// =============================================================================

/**
 * Core Web Vitals per page type for confirmed-human sessions only.
 *
 * The existing `getPerformanceByPageType` scans the whole `performance` table,
 * which has NO `is_bot` column at all (the live table predates it — the schema
 * file disagrees, drift from the no-migrations era). The fleet executes JS and
 * therefore posts web-vitals beacons, so those numbers are fleet p75s, and the
 * gap is not cosmetic — measured on prod over 30 days:
 *
 *   page type   all beacons          confirmed humans
 *   movie       p75 LCP 11,309ms     p75 LCP 3,301ms   (327,812 vs 382 samples)
 *   series      p75 LCP 10,025ms     p75 LCP 2,891ms
 *   person      p75 LCP 11,221ms     p75 LCP 2,267ms
 *
 * Both are rendered side by side rather than one replacing the other: the
 * all-beacons figure is the only one with enough samples to be stable, and the
 * gap between the two columns is itself the useful reading.
 *
 * `performance` carries no `is_authenticated`, so the floor here is the
 * acting-session half only — a slightly smaller scope than the rest of the panel.
 */
export async function getHumanPerformanceByPageType(
  range: TimeRange
): Promise<HumanPageTypePerformance[]> {
  const timeCondition = getTimeRangeCondition(range);

  const rows = await query<Record<string, string | null>>(`
    SELECT
      page_type,
      count() AS samples,
      quantile(0.75)(lcp) AS p75_lcp,
      quantile(0.75)(cls) AS p75_cls,
      quantile(0.75)(ttfb) AS p75_ttfb,
      quantile(0.75)(inp) AS p75_inp
    FROM performance
    WHERE ${timeCondition} AND ${confirmedHumanViewerSql(range, false)}
    GROUP BY page_type
    ORDER BY samples DESC
  `);

  return rows.map((r) => ({
    pageType: r.page_type || "other",
    samples: num(r.samples),
    p75Lcp: num(r.p75_lcp),
    p75Cls: num(r.p75_cls),
    p75Ttfb: num(r.p75_ttfb),
    p75Inp: nullableNum(r.p75_inp),
  }));
}
