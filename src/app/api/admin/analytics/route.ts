/**
 * Admin Analytics API
 *
 * Unified endpoint for fetching analytics data for the admin dashboard.
 * Protected - requires admin role.
 *
 * GET /api/admin/analytics?type=overview&range=7
 * GET /api/admin/analytics?type=ai&range=30
 * GET /api/admin/analytics?type=alerts
 * GET /api/admin/analytics?type=system
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import {
  // Traffic
  getTrafficOverview,
  getDailyTraffic,
  getDailyTrafficWithBots,
  getHourlyTraffic,
  getHourlyTrafficWithBots,
  getTopPages,
  getGeoDistribution,
  getDeviceBreakdown,
  getTopBotSources,
  getTopUserAgents,
  // Audience (three-way split + abuse + crawlers)
  getAudienceOverview,
  getAudienceTrend,
  getFleetCohorts,
  getShedReasons,
  getFleetTargets,
  getAbuseFlags,
  getVerifiedCrawlers,
  getCrawlerTrend,
  getServedBotTypes,
  getCountryDeviceMix,
  getSessionPacingFlags,
  // Agent layer (.md twins + llms.txt)
  getLlmLayerOverview,
  getLlmLayerTrend,
  getLlmLayerConsumers,
  getLlmLayerTargets,
  // AI
  getAIUsageOverview,
  getDailyAICosts,
  getTopAIUsers,
  getQueryTypeDistribution,
  getUserAIStats,
  // Performance
  getPerformanceMetrics,
  getPerformanceByPageType,
  getPerformanceTrend,
  // Errors
  getErrorOverview,
  getErrorTrend,
  getTopErrors,
  getErrorDetails,
  getErrorOccurrences,
  // Content
  getTopContent,
  getUserActionSummary,
  getDailyUserActions,
  // Product (confirmed-human-scoped conversion / engagement)
  getProductOverview,
  getTitleConversion,
  getTopTitles,
  getHumanPerformanceByPageType,
  // Lambda
  getLambdaUsageOverview,
  getLambdaByFunction,
  getDailyLambdaUsage,
  // Embedding
  getEmbeddingUsageOverview,
  // Costs
  getUnifiedCostBreakdown,
  // System
  getSystemMetricsHistory,
  getCPUHistory,
  getMemoryHistory,
  // Database
  getDatabaseStats,
  // Alerts
  checkAllAlerts,
  // Utility
  hasAnalyticsData,
  checkClickHouseHealth,
  type TrafficGranularity,
  type Granularity,
} from "@/lib/analytics";
import { getCacheStats, getCacheSizeStats } from "@/lib/cache-service";
import { getSystemMetrics, getSystemHealth } from "@/lib/system-metrics";

/**
 * Bucket size for the audience/crawler trends. Validated rather than cast: a
 * bad value used to flow straight into the SQL builder's bucket expression.
 */
const AudienceGranularitySchema = z.enum(["hour", "day"]).catch("day");

/**
 * Which slice of the Product tab to compute. Validated (not cast) because it
 * selects which ClickHouse queries run: the `titles` panel costs two full
 * `page_views` scans, so a typo must fall back to the cheap default rather than
 * silently running everything.
 */
const ProductPanelSchema = z.enum(["engagement", "titles", "speed"]).catch("engagement");

/**
 * Get live cache metrics directly from the cache service
 * This provides real-time stats without needing ClickHouse persistence
 */
function getLiveCacheMetrics() {
  try {
    const stats = getCacheStats();
    return {
      l1HitRate: stats.hitRates.l1 * 100, // Convert to percentage
      l2HitRate: stats.hitRates.l2 * 100,
      totalHits: stats.custom.l1Hits + stats.custom.l2Hits,
      totalMisses: stats.custom.l1Misses + stats.custom.l2Misses,
      memoryKeys: stats.memory.keys,
      compressionSavings: stats.custom.compressionSavings,
      fetchErrors: stats.custom.fetchErrors,
    };
  } catch (error) {
    adminApiLogger.warn({
      event: "cache_stats_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") || "overview";
  const days = parseInt(searchParams.get("range") || "7", 10);
  const humanOnly = searchParams.get("humanOnly") === "1";

  const range = { days };

  try {
    switch (type) {
      // =======================================================================
      // Health & Status
      // =======================================================================
      case "health": {
        const [health, hasData] = await Promise.all([
          checkClickHouseHealth(),
          hasAnalyticsData().catch(() => false),
        ]);
        return NextResponse.json({ health, hasData });
      }

      // =======================================================================
      // Overview (all metrics for dashboard)
      // =======================================================================
      case "overview": {
        const [traffic, aiUsage, performance, errors, lambda, embedding, alerts] = await Promise.all([
          getTrafficOverview(range, humanOnly).catch(() => null),
          getAIUsageOverview(range).catch(() => null),
          getPerformanceMetrics(range).catch(() => null),
          getErrorOverview(range).catch(() => null),
          getLambdaUsageOverview(range).catch(() => null),
          getEmbeddingUsageOverview(range).catch(() => null),
          checkAllAlerts().catch(() => ({
            alerts: [],
            checkedAt: new Date().toISOString(),
            durationMs: 0,
          })),
        ]);

        // Get live cache metrics directly (more reliable than ClickHouse persistence)
        const cache = getLiveCacheMetrics();

        return NextResponse.json({
          traffic,
          aiUsage,
          performance,
          errors,
          lambda,
          embedding,
          cache,
          alerts: alerts.alerts,
          checkedAt: alerts.checkedAt,
        });
      }

      // =======================================================================
      // Traffic Dashboard
      // =======================================================================
      case "traffic": {
        const [overview, daily, dailyWithBots, topPages, geo, devices, topBots, topUserAgents] =
          await Promise.all([
            getTrafficOverview(range, humanOnly),
            getDailyTraffic(range, humanOnly),
            getDailyTrafficWithBots(range),
            getTopPages(range, 15, humanOnly),
            getGeoDistribution(range, 10, humanOnly),
            getDeviceBreakdown(range, humanOnly),
            getTopBotSources(range),
            getTopUserAgents(range, 10),
          ]);

        return NextResponse.json({
          overview,
          daily,
          dailyWithBots,
          topPages,
          geo,
          devices,
          topBots,
          topUserAgents,
        });
      }

      // =======================================================================
      // Audience — the three-way honest split (crawlers / bots+fleets / humans)
      // =======================================================================
      case "audience": {
        const granularity = AudienceGranularitySchema.parse(
          searchParams.get("granularity") ?? "day"
        );
        // Sequential: each of these scans the range's page_views once and the
        // box runs ClickHouse capped at 0.9 CPU. Fetched on tab load only.
        const overview = await getAudienceOverview(range);
        const trend = await getAudienceTrend(range, granularity);

        return NextResponse.json({ overview, trend, granularity });
      }

      // =======================================================================
      // Abuse / crawl pressure — LAZY: only fetched when the panel is opened,
      // because the cohort-scoring CTE is the expensive part of this module.
      // =======================================================================
      case "abuse": {
        const cohorts = await getFleetCohorts(range, 15);
        const flags = await getAbuseFlags(range);
        const targets = await getFleetTargets(range, "page_type", 8);
        const deviceMix = await getCountryDeviceMix(range, 12);
        const pacing = await getSessionPacingFlags(range);
        const [shedReasons, servedBots] = await Promise.all([
          getShedReasons(range),
          getServedBotTypes(range, 8),
        ]);

        return NextResponse.json({
          cohorts,
          flags,
          targets,
          shedReasons,
          servedBots,
          deviceMix,
          pacing,
        });
      }

      // =======================================================================
      // Verified crawlers — LAZY, and cheap (frozen ingest labels only).
      // =======================================================================
      case "crawlers": {
        const granularity = AudienceGranularitySchema.parse(
          searchParams.get("granularity") ?? "day"
        );
        const [crawlers, trend] = await Promise.all([
          getVerifiedCrawlers(range, 12),
          getCrawlerTrend(range, granularity, 5),
        ]);

        return NextResponse.json({ crawlers, trend, granularity });
      }

      // =======================================================================
      // Agent layer (.md twins + llms.txt) — LAZY. Four single-pass aggregates
      // over page_views with a path predicate; run SEQUENTIALLY because
      // ClickHouse is capped at 0.9 of 2 vCPUs on this box and four concurrent
      // range scans is exactly the shape that has starved it before.
      // =======================================================================
      case "llm-layer": {
        const granularity = AudienceGranularitySchema.parse(
          searchParams.get("granularity") ?? "day"
        );
        const overview = await getLlmLayerOverview(range);
        const trend = await getLlmLayerTrend(range, granularity);
        const consumers = await getLlmLayerConsumers(range, 20);
        const targets = await getLlmLayerTargets(range);

        return NextResponse.json({ overview, trend, consumers, targets, granularity });
      }

      // =======================================================================
      // AI Dashboard
      // =======================================================================
      case "ai": {
        // Run sequentially to avoid exceeding ClickHouse server memory limit (1 GiB).
        // Overview and daily use the pre-aggregated hourly_ai_costs MV (lightweight).
        // TopUsers and queryTypes scan the raw table (heavier).
        const overview = await getAIUsageOverview(range);
        const daily = await getDailyAICosts(range);
        const topUsers = await getTopAIUsers(range, 10);
        const queryTypes = await getQueryTypeDistribution(range);

        return NextResponse.json({
          overview,
          daily,
          topUsers,
          queryTypes,
        });
      }

      // =======================================================================
      // Lambda Dashboard
      // =======================================================================
      case "lambda": {
        const [overview, byFunction, daily] = await Promise.all([
          getLambdaUsageOverview(range),
          getLambdaByFunction(range),
          getDailyLambdaUsage(range),
        ]);

        return NextResponse.json({
          overview,
          byFunction,
          daily,
        });
      }

      // =======================================================================
      // Performance Dashboard
      // =======================================================================
      case "performance": {
        const [metrics, byPageType, trend] = await Promise.all([
          getPerformanceMetrics(range),
          getPerformanceByPageType(range),
          getPerformanceTrend(24),
        ]);

        return NextResponse.json({
          metrics,
          byPageType,
          trend,
        });
      }

      // =======================================================================
      // Errors Dashboard
      // =======================================================================
      case "errors": {
        const [overview, trend, topErrors] = await Promise.all([
          getErrorOverview(range),
          getErrorTrend(24),
          getTopErrors(range, 15),
        ]);

        return NextResponse.json({
          overview,
          trend,
          topErrors,
        });
      }

      // =======================================================================
      // Error Detail (for drill-down)
      // =======================================================================
      case "error_detail": {
        const errorType = searchParams.get("errorType");
        const errorSource = searchParams.get("errorSource");

        if (!errorType || !errorSource) {
          return NextResponse.json(
            { error: "Missing errorType or errorSource parameter" },
            { status: 400 }
          );
        }

        const [detail, occurrences, topErrors] = await Promise.all([
          getErrorDetails(errorType, errorSource, range),
          getErrorOccurrences(errorType, errorSource, range, 20),
          getTopErrors(range, 100), // Get all to count total
        ]);

        // Count total occurrences of this error type
        const totalCount =
          topErrors.find((e) => e.errorType === errorType && e.errorSource === errorSource)
            ?.count || occurrences.length;

        return NextResponse.json({
          detail,
          occurrences,
          totalCount,
        });
      }

      // =======================================================================
      // Content Performance
      // =======================================================================
      case "content": {
        const mediaType = searchParams.get("mediaType") as "movie" | "series" | undefined;
        const [topContent, actions] = await Promise.all([
          getTopContent(range, mediaType, 20),
          getUserActionSummary(range),
        ]);

        return NextResponse.json({
          topContent,
          actions,
        });
      }

      // =======================================================================
      // Product — is the product being USED? (Phase 1 of the analytics
      // overhaul spec: render data already collected and never displayed.)
      //
      // LAZY (the tab gates it client-side) and SEQUENTIAL. Three of these scan
      // `page_views` over the whole range with a session-set subquery, and
      // ClickHouse is capped at 0.9 of 2 vCPUs on this box — the same reason the
      // audience/abuse/llm-layer cases avoid `Promise.all`. Measured on prod:
      // ~0.9s per page_views scan at 7 days, ~2.3s at 30. The `user_actions` and
      // `performance` queries are sub-100ms (small tables).
      // =======================================================================
      case "product": {
        const panel = ProductPanelSchema.parse(searchParams.get("panel") ?? "engagement");

        if (panel === "titles") {
          // Two `page_views` scans — the expensive pair, hence its own panel.
          const conversion = await getTitleConversion(range, 12);
          const topTitles = await getTopTitles(range, 15);
          return NextResponse.json({ conversion, topTitles });
        }

        if (panel === "speed") {
          const perfByPageType = await getPerformanceByPageType(range);
          const humanPerfByPageType = await getHumanPerformanceByPageType(range);
          const perfTrend = await getPerformanceTrend(24);
          return NextResponse.json({ perfByPageType, humanPerfByPageType, perfTrend });
        }

        const overview = await getProductOverview(range);
        const actions = await getUserActionSummary(range);
        const dailyActions = await getDailyUserActions(range, 6);
        return NextResponse.json({ overview, actions, dailyActions });
      }

      // =======================================================================
      // Alerts Only
      // =======================================================================
      case "alerts": {
        const result = await checkAllAlerts();
        return NextResponse.json(result);
      }

      // =======================================================================
      // Cache Metrics (live from cache service)
      // =======================================================================
      case "cache": {
        const metrics = getLiveCacheMetrics();
        const sizeStats = getCacheSizeStats();
        return NextResponse.json({ metrics, sizeStats });
      }

      // =======================================================================
      // System Metrics (live from Node.js process)
      // =======================================================================
      case "system": {
        const metrics = getSystemMetrics();
        const health = getSystemHealth(metrics);
        return NextResponse.json({ metrics, health });
      }

      // =======================================================================
      // System Metrics History (for correlation charts)
      // =======================================================================
      case "system_history": {
        const granularity = (searchParams.get("granularity") || "5min") as Granularity;
        const history = await getSystemMetricsHistory(range, granularity);
        return NextResponse.json(history);
      }

      // =======================================================================
      // Traffic History (hourly granularity for correlation)
      // =======================================================================
      case "traffic_history": {
        const granularity = (searchParams.get("granularity") || "day") as TrafficGranularity;

        if (granularity === "hour") {
          const [hourly, hourlyWithBots] = await Promise.all([
            getHourlyTraffic(range),
            getHourlyTrafficWithBots(range),
          ]);
          return NextResponse.json({ data: hourly, withBots: hourlyWithBots, granularity });
        } else {
          const [daily, dailyWithBots] = await Promise.all([
            getDailyTraffic(range),
            getDailyTrafficWithBots(range),
          ]);
          return NextResponse.json({ data: daily, withBots: dailyWithBots, granularity });
        }
      }

      // =======================================================================
      // CPU History (simple line chart data)
      // =======================================================================
      case "cpu_history": {
        const granularity = (searchParams.get("granularity") || "5min") as Granularity;
        const data = await getCPUHistory(range, granularity);
        return NextResponse.json({ data, granularity });
      }

      // =======================================================================
      // Memory History (simple line chart data)
      // =======================================================================
      case "memory_history": {
        const granularity = (searchParams.get("granularity") || "5min") as Granularity;
        const data = await getMemoryHistory(range, granularity);
        return NextResponse.json({ data, granularity });
      }

      // =======================================================================
      // Unified Costs Dashboard
      // =======================================================================
      case "costs": {
        const costBreakdown = await getUnifiedCostBreakdown(range);
        return NextResponse.json(costBreakdown);
      }

      // =======================================================================
      // User AI Stats (for Users dashboard)
      // =======================================================================
      case "user_ai_stats": {
        const stats = await getUserAIStats(range);
        return NextResponse.json(stats);
      }

      // =======================================================================
      // Database Stats (PostgreSQL counts, TMDB coverage, refresh activity)
      // =======================================================================
      case "database": {
        const stats = await getDatabaseStats();
        return NextResponse.json(stats);
      }

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    adminApiLogger.error({
      event: "analytics_api_error",
      type,
      days,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
