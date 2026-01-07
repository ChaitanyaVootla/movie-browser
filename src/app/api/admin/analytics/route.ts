/**
 * Admin Analytics API
 *
 * Unified endpoint for fetching analytics data for the admin dashboard.
 * Protected - requires admin role.
 *
 * GET /api/admin/analytics?type=overview&range=7
 * GET /api/admin/analytics?type=ai&range=30
 * GET /api/admin/analytics?type=alerts
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminApiLogger } from "@/lib/logger";
import {
  // Traffic
  getTrafficOverview,
  getDailyTraffic,
  getTopPages,
  getGeoDistribution,
  getDeviceBreakdown,
  // AI
  getAIUsageOverview,
  getDailyAICosts,
  getTopAIUsers,
  getQueryTypeDistribution,
  // Performance
  getPerformanceMetrics,
  getPerformanceByPageType,
  getPerformanceTrend,
  // Errors
  getErrorOverview,
  getErrorTrend,
  getTopErrors,
  // Cache
  getCacheMetricsSnapshot,
  // Content
  getTopContent,
  getUserActionSummary,
  // Alerts
  checkAllAlerts,
  // Utility
  hasAnalyticsData,
  checkClickHouseHealth,
} from "@/lib/analytics";

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
        const [traffic, aiUsage, performance, errors, cache, alerts] = await Promise.all([
          getTrafficOverview(range).catch(() => null),
          getAIUsageOverview(range).catch(() => null),
          getPerformanceMetrics(range).catch(() => null),
          getErrorOverview(range).catch(() => null),
          getCacheMetricsSnapshot().catch(() => null),
          checkAllAlerts().catch(() => ({ alerts: [], checkedAt: new Date().toISOString(), durationMs: 0 })),
        ]);

        return NextResponse.json({
          traffic,
          aiUsage,
          performance,
          errors,
          cache,
          alerts: alerts.alerts,
          checkedAt: alerts.checkedAt,
        });
      }

      // =======================================================================
      // Traffic Dashboard
      // =======================================================================
      case "traffic": {
        const [overview, daily, topPages, geo, devices] = await Promise.all([
          getTrafficOverview(range),
          getDailyTraffic(range),
          getTopPages(range, 15),
          getGeoDistribution(range, 10),
          getDeviceBreakdown(range),
        ]);

        return NextResponse.json({
          overview,
          daily,
          topPages,
          geo,
          devices,
        });
      }

      // =======================================================================
      // AI Dashboard
      // =======================================================================
      case "ai": {
        const [overview, daily, topUsers, queryTypes] = await Promise.all([
          getAIUsageOverview(range),
          getDailyAICosts(range),
          getTopAIUsers(range, 10),
          getQueryTypeDistribution(range),
        ]);

        return NextResponse.json({
          overview,
          daily,
          topUsers,
          queryTypes,
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
      // Alerts Only
      // =======================================================================
      case "alerts": {
        const result = await checkAllAlerts();
        return NextResponse.json(result);
      }

      // =======================================================================
      // Cache Metrics
      // =======================================================================
      case "cache": {
        const metrics = await getCacheMetricsSnapshot();
        return NextResponse.json({ metrics });
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

