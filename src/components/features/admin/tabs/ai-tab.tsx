"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DistributionPieChart } from "../analytics-charts";
import { EmptyState, CopyableText } from "../analytics-shared";
import type { AIData, TimeRange } from "../analytics-types";

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchAIData(range: TimeRange): Promise<AIData> {
  const res = await fetch(`/api/admin/analytics?type=ai&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch AI data");
  return res.json();
}

// =============================================================================
// AI Tab
// =============================================================================

interface AITabProps {
  range: TimeRange;
}

export function AITab({ range }: AITabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "analytics", "ai", range],
    queryFn: () => fetchAIData(range),
    staleTime: 60 * 1000,
  });

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Could not load AI data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* AI Overview - Compact */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : data?.overview ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-2xl font-bold">${data.overview.totalCost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Cost</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {data.overview.totalInvocations.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Invocations</p>
              </div>
              <div>
                <p className="text-lg font-medium">{data.overview.totalTokens.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Tokens</p>
              </div>
              <div>
                <p className="text-lg font-medium">{data.overview.avgResponseTime.toFixed(0)}ms</p>
                <p className="text-xs text-muted-foreground">Avg Response</p>
              </div>
            </div>
          ) : (
            <EmptyState message="No AI usage data" height={80} />
          )}
        </CardContent>
      </Card>

      {/* Query Types */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Query Types</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : data?.queryTypes && data.queryTypes.length > 0 ? (
            <DistributionPieChart
              data={
                data.queryTypes.map((qt) => ({
                  name: qt.queryType,
                  value: qt.count,
                })) ?? []
              }
              size={120}
              maxItems={6}
            />
          ) : (
            <EmptyState message="No query type data" height={120} />
          )}
        </CardContent>
      </Card>

      {/* Top AI Users - With Tooltips & Copy */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top AI Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : data?.topUsers && data.topUsers.length > 0 ? (
            <div className="space-y-1">
              {data.topUsers.slice(0, 5).map((user, i) => (
                <TopAIUserRow key={user.userId} user={user} rank={i + 1} />
              ))}
            </div>
          ) : (
            <EmptyState message="No AI usage data" height={80} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Top AI User Row (with User Name & Copyable ID)
// =============================================================================

interface TopAIUserRowProps {
  user: AIData["topUsers"][0];
  rank: number;
}

function TopAIUserRow({ user, rank }: TopAIUserRowProps) {
  // Determine display name - prefer userName if available
  const displayName =
    user.userName && user.userName !== "Guest"
      ? user.userName
      : user.isAuthenticated
        ? "Unknown User"
        : "Guest";

  // Only show copyable ID for authenticated users (guest IDs are session-based)
  const showCopyableId = user.isAuthenticated && user.userId !== "guest";

  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-b last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-4">{rank}.</span>
        <span className="font-medium">{displayName}</span>
        {showCopyableId && (
          <CopyableText
            text={user.userId}
            displayText={`${user.userId.slice(0, 8)}...`}
            maxLength={8}
            className="opacity-60"
          />
        )}
        {user.isAuthenticated && (
          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
            Auth
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>{user.invocations} calls</span>
        <span className="font-medium text-foreground">${user.cost.toFixed(3)}</span>
      </div>
    </div>
  );
}
