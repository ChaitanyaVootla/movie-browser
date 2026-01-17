/**
 * Health Check & Cache Metrics Endpoint
 *
 * GET /api/health - Basic health check with cache stats
 * GET /api/health?format=prometheus - Prometheus metrics format
 * GET /api/health?format=detailed - Full cache details
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCacheStats,
  getCacheSizeStats,
  getPrometheusMetrics,
  isWarmingComplete,
} from "@/lib/cache-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: string;
  cache: {
    warmingComplete: boolean;
    hitRates: {
      l1: string;
      l2: string;
    };
    memoryKeys: number;
  };
}

interface DetailedHealthResponse extends HealthResponse {
  cache: HealthResponse["cache"] & {
    stats: {
      l1Hits: number;
      l1Misses: number;
      l2Hits: number;
      l2Misses: number;
      staleHits: number;
      backgroundRefreshes: number;
      compressionSavings: string;
      compressedWrites: number;
      fetchErrors: number;
    };
    namespaces: Record<string, { files: number; size: string }>;
  };
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");

  // Prometheus format
  if (format === "prometheus") {
    const metrics = getPrometheusMetrics();
    return new NextResponse(metrics, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const stats = getCacheStats();
  const warmingComplete = isWarmingComplete();

  // Determine health status
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check for degraded state
  const l1HitRate = stats.hitRates.l1;
  const totalRequests = stats.custom.l1Hits + stats.custom.l1Misses;

  // After 100+ requests, if hit rate is below 50%, consider degraded
  if (totalRequests > 100 && l1HitRate < 0.5) {
    status = "degraded";
  }

  // Check for high error rate
  if (stats.custom.fetchErrors > 10) {
    status = "degraded";
  }

  // Base response
  const baseResponse: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "unknown",
    uptime: stats.uptime.human,
    cache: {
      warmingComplete,
      hitRates: {
        l1: `${(l1HitRate * 100).toFixed(1)}%`,
        l2: `${(stats.hitRates.l2 * 100).toFixed(1)}%`,
      },
      memoryKeys: stats.memory.keys,
    },
  };

  // Detailed format
  if (format === "detailed") {
    const sizeStats = getCacheSizeStats();
    const namespaces: Record<string, { files: number; size: string }> = {};

    for (const [ns, { files, sizeBytes }] of Object.entries(sizeStats)) {
      namespaces[ns] = {
        files,
        size: formatBytes(sizeBytes),
      };
    }

    const detailedResponse: DetailedHealthResponse = {
      ...baseResponse,
      cache: {
        ...baseResponse.cache,
        stats: {
          l1Hits: stats.custom.l1Hits,
          l1Misses: stats.custom.l1Misses,
          l2Hits: stats.custom.l2Hits,
          l2Misses: stats.custom.l2Misses,
          staleHits: stats.custom.staleHits,
          backgroundRefreshes: stats.custom.backgroundRefreshes,
          compressionSavings: formatBytes(stats.custom.compressionSavings),
          compressedWrites: stats.custom.compressedWrites,
          fetchErrors: stats.custom.fetchErrors,
        },
        namespaces,
      },
    };

    return NextResponse.json(detailedResponse);
  }

  return NextResponse.json(baseResponse);
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
