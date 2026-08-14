"use client";

/**
 * Engagement panel — what people DO, and how many people there are to divide by.
 *
 * The action summary is the single highest-value thing on this tab and it needed
 * no new collection at all: `getUserActionSummary` has existed unrendered since
 * the analytics module was built. Read down the list and the product's biggest
 * problem is visible in two adjacent rows — over 30 days on prod, `ai_chat_open`
 * 345 against `ai_chat_submit` 17, and `search_submit` 249 against
 * `search_result_click` 99.
 *
 * The panel stops at showing both numbers side by side. Turning a pair of rows
 * into a funnel with a stated drop-off rate is Phase 2 of the spec and needs the
 * per-visitor identity Phase 3 mints; a ratio computed today would divide two
 * counts whose sessions were never joined.
 */

import { Activity, MousePointerClick, Users, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSeriesChart } from "../../analytics-charts";
import { EmptyState, abbreviateNumber, formatChartDate } from "../../analytics-shared";
import type {
  DailyUserAction,
  ProductEngagementData,
  UserActionSummary,
} from "../../analytics-types";
import { ProductStat } from "./product-stat";

interface EngagementPanelProps {
  data: ProductEngagementData | undefined;
  isLoading: boolean;
}

export function EngagementPanel({ data, isLoading }: EngagementPanelProps) {
  const overview = data?.overview;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProductStat
          icon={Users}
          label="Confirmed-human sessions"
          value={overview?.confirmedSessions}
          detail="authenticated or acted"
          isLoading={isLoading}
          emphasis
        />
        <ProductStat
          icon={Eye}
          label="Their page views"
          value={overview?.confirmedViews}
          detail={
            overview
              ? `${abbreviateNumber(overview.confirmedItemViews)} on a title page`
              : undefined
          }
          isLoading={isLoading}
        />
        <ProductStat
          icon={MousePointerClick}
          label="Tracked actions"
          value={overview?.totalActions}
          detail={
            overview ? `${abbreviateNumber(overview.actingSessions)} sessions acted` : undefined
          }
          isLoading={isLoading}
        />
        <ProductStat
          icon={Activity}
          label="Titles acted on"
          value={overview?.titlesActedOn}
          detail={
            overview ? `${abbreviateNumber(overview.actingUsers)} signed-in actors` : undefined
          }
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MousePointerClick className="h-4 w-4" />
            What people do
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : data?.actions && data.actions.length > 0 ? (
            <ActionTable actions={data.actions} />
          ) : (
            <EmptyState message="No tracked actions in this range" height={120} icon={Activity} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            Top actions over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : data?.dailyActions && data.dailyActions.length > 0 ? (
            <DailyActionsChart rows={data.dailyActions} />
          ) : (
            <EmptyState message="No action history in this range" height={220} icon={Activity} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Action table (bar-track list — the llm-panel pattern)
// =============================================================================

function ActionTable({ actions }: { actions: UserActionSummary[] }) {
  const max = Math.max(...actions.map((a) => a.count), 1);

  return (
    <div className="space-y-2.5">
      {actions.map((a) => (
        <div key={a.action} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono text-[11px] text-foreground/90">{a.action}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-[10px] text-muted-foreground">
                {a.uniqueUsers > 0 ? `${a.uniqueUsers.toLocaleString()} signed-in` : "anon only"}
              </span>
              <span className="w-16 text-right font-medium">{a.count.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${(a.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Daily actions chart
// =============================================================================

/**
 * `getDailyUserActions` returns one long-format row per (date, action). Recharts
 * needs wide format, so pivot: one object per date carrying a key per action.
 * Absent combinations become 0 rather than being left undefined — a gap in a
 * recharts series renders as a broken line, which reads as missing data instead
 * of "nobody did this that day".
 */
function DailyActionsChart({ rows }: { rows: DailyUserAction[] }) {
  const actionNames = Array.from(new Set(rows.map((r) => r.action)));
  const byDate = new Map<string, Record<string, number | string>>();

  for (const row of rows) {
    let entry = byDate.get(row.date);
    if (!entry) {
      entry = { date: row.date };
      for (const name of actionNames) entry[name] = 0;
      byDate.set(row.date, entry);
    }
    entry[row.action] = row.count;
  }

  const data = Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  return (
    <MultiSeriesChart
      data={data as Array<{ date: string; [key: string]: unknown }>}
      series={actionNames.map((name) => ({ key: name, name }))}
      height={220}
      formatValue={abbreviateNumber}
      formatDate={formatChartDate}
    />
  );
}
