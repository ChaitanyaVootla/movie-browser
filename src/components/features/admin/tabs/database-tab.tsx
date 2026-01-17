"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Database,
  Film,
  Tv,
  Users,
  RefreshCw,
  Star,
  Tv2,
  Calendar,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "../analytics-shared";
import type { DatabaseStats, RefreshStats } from "../analytics-types";

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const res = await fetch(`/api/admin/analytics?type=database`);
  if (!res.ok) throw new Error("Failed to fetch database stats");
  return res.json();
}

// =============================================================================
// Database Tab
// =============================================================================

export function DatabaseTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "database"],
    queryFn: fetchDatabaseStats,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Could not load database stats</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Database Counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            PostgreSQL Counts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : data?.dbCounts ? (
            <div className="grid grid-cols-2 gap-3">
              <CountItem icon={Film} label="Movies" value={data.dbCounts.movies} />
              <CountItem icon={Tv} label="Series" value={data.dbCounts.series} />
              <CountItem icon={Users} label="Persons" value={data.dbCounts.persons} />
              <CountItem icon={Tv2} label="Episodes" value={data.dbCounts.episodes} />
              <CountItem icon={Star} label="Ratings" value={data.dbCounts.ratings} />
              <CountItem icon={Film} label="Videos" value={data.dbCounts.videos} />
            </div>
          ) : (
            <EmptyState message="No database data" height={132} />
          )}
        </CardContent>
      </Card>

      {/* TMDB Available Counts */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              TMDB Available
            </CardTitle>
            {data?.tmdbCounts?.exportDate && (
              <Badge variant="outline" className="text-[9px] h-4">
                {data.tmdbCounts.exportDate}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.tmdbCounts ? (
            <div className="space-y-3">
              <TMDBAvailableRow
                label="Movies"
                available={data.tmdbCounts.movies}
                inDb={data.dbCounts.movies}
                coveragePercent={data.coverage.moviesPercent}
              />
              <TMDBAvailableRow
                label="Series"
                available={data.tmdbCounts.series}
                inDb={data.dbCounts.series}
                coveragePercent={data.coverage.seriesPercent}
              />
              <TMDBAvailableRow
                label="Persons"
                available={data.tmdbCounts.persons}
                inDb={data.dbCounts.persons}
                coveragePercent={data.coverage.personsPercent}
              />
            </div>
          ) : (
            <EmptyState message="No export data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Enrichment Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Enrichment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.enrichment ? (
            <div className="space-y-3">
              <EnrichmentRow
                label="Movies w/ Ratings"
                enriched={data.enrichment.moviesWithRatings}
                total={data.dbCounts.movies}
              />
              <EnrichmentRow
                label="Series w/ Ratings"
                enriched={data.enrichment.seriesWithRatings}
                total={data.dbCounts.series}
              />
              <EnrichmentRow
                label="Movies w/ Watch Links"
                enriched={data.enrichment.moviesWithWatchLinks}
                total={data.dbCounts.movies}
              />
              <EnrichmentRow
                label="Series w/ Watch Links"
                enriched={data.enrichment.seriesWithWatchLinks}
                total={data.dbCounts.series}
              />
            </div>
          ) : (
            <EmptyState message="No enrichment data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Movie Refresh Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-green-500" />
            Movie Refreshes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.movieRefresh ? (
            <RefreshStatsGrid stats={data.movieRefresh} />
          ) : (
            <EmptyState message="No refresh data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Series Refresh Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-purple-500" />
            Series Refreshes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.seriesRefresh ? (
            <RefreshStatsGrid stats={data.seriesRefresh} />
          ) : (
            <EmptyState message="No refresh data" height={96} />
          )}
        </CardContent>
      </Card>

      {/* Data Freshness Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Freshness Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : data ? (
            <FreshnessOverview data={data} />
          ) : (
            <EmptyState message="No freshness data" height={96} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

interface CountItemProps {
  icon: React.ElementType;
  label: string;
  value: number;
}

function CountItem({ icon: Icon, label, value }: CountItemProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

interface TMDBAvailableRowProps {
  label: string;
  available: number;
  inDb: number;
  coveragePercent: number;
}

function TMDBAvailableRow({ label, available, inDb, coveragePercent }: TMDBAvailableRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">
          {inDb.toLocaleString()} / {available.toLocaleString()}
        </span>
      </div>
      <Progress value={coveragePercent} className="h-1.5" />
      <p className="text-[10px] text-muted-foreground text-right">
        {coveragePercent.toFixed(3)}% coverage
      </p>
    </div>
  );
}

interface EnrichmentRowProps {
  label: string;
  enriched: number;
  total: number;
}

function EnrichmentRow({ label, enriched, total }: EnrichmentRowProps) {
  const percent = total > 0 ? (enriched / total) * 100 : 0;
  const isComplete = percent >= 95;
  const isGood = percent >= 50;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground flex items-center gap-1">
        {isComplete ? (
          <CheckCircle className="h-3 w-3 text-green-500" />
        ) : isGood ? (
          <CheckCircle className="h-3 w-3 text-amber-500" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        )}
        {label}
      </span>
      <span className="font-medium">
        {enriched.toLocaleString()}{" "}
        <span className="text-muted-foreground">({percent.toFixed(1)}%)</span>
      </span>
    </div>
  );
}

interface RefreshStatsGridProps {
  stats: RefreshStats;
}

function RefreshStatsGrid({ stats }: RefreshStatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <RefreshStatItem label="Last Hour" value={stats.lastHour} highlight />
      <RefreshStatItem label="Last 24h" value={stats.last24Hours} />
      <RefreshStatItem label="Last 7d" value={stats.last7Days} />
      <RefreshStatItem label="Last 30d" value={stats.last30Days} />
    </div>
  );
}

interface RefreshStatItemProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function RefreshStatItem({ label, value, highlight }: RefreshStatItemProps) {
  return (
    <div
      className={`p-2 rounded-md ${
        highlight ? "bg-green-500/10 border border-green-500/30" : "bg-muted/30"
      }`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight && value > 0 ? "text-green-500" : ""}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

interface FreshnessOverviewProps {
  data: DatabaseStats;
}

function FreshnessOverview({ data }: FreshnessOverviewProps) {
  const totalRefreshLast24h = data.movieRefresh.last24Hours + data.seriesRefresh.last24Hours;
  const totalInDb = data.dbCounts.movies + data.dbCounts.series;
  const refreshRate = totalInDb > 0 ? (totalRefreshLast24h / totalInDb) * 100 : 0;

  // Determine freshness status
  let status: "fresh" | "stale" | "critical" = "fresh";
  let statusLabel = "Fresh";
  let statusColor = "text-green-500";

  if (refreshRate < 1) {
    status = "critical";
    statusLabel = "No Activity";
    statusColor = "text-red-500";
  } else if (refreshRate < 5) {
    status = "stale";
    statusLabel = "Low Activity";
    statusColor = "text-amber-500";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">24h Refresh Rate</span>
        <Badge
          variant="outline"
          className={`text-[10px] ${status === "fresh" ? "border-green-500/50" : status === "stale" ? "border-amber-500/50" : "border-red-500/50"}`}
        >
          <span className={statusColor}>{statusLabel}</span>
        </Badge>
      </div>
      <div className="text-center py-2">
        <p className={`text-3xl font-bold ${statusColor}`}>
          {totalRefreshLast24h.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">items refreshed in last 24h</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="text-center p-1.5 bg-muted/30 rounded">
          <p className="font-medium">{data.movieRefresh.last24Hours}</p>
          <p className="text-[10px] text-muted-foreground">Movies</p>
        </div>
        <div className="text-center p-1.5 bg-muted/30 rounded">
          <p className="font-medium">{data.seriesRefresh.last24Hours}</p>
          <p className="text-[10px] text-muted-foreground">Series</p>
        </div>
      </div>
    </div>
  );
}
