"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, BarChart3, Activity, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDashboard } from "@/components/features/admin";
import { UsersTab, InspectTab } from "@/components/features/admin/tabs";
import type { TimeRange, AnalyticsSubTab } from "@/components/features/admin/analytics-types";

const VALID_TABS = ["analytics", "users", "inspect"] as const;
const VALID_SUBTABS: AnalyticsSubTab[] = [
  "traffic",
  "ai",
  "lambda",
  "performance",
  "system",
  "database",
  "query",
];
const DEFAULT_TAB = "analytics";
const DEFAULT_SUBTAB: AnalyticsSubTab = "traffic";
const DEFAULT_RANGE: TimeRange = 7;

export function AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parse URL params with validation
  const tabParam = searchParams.get("tab");
  const subtabParam = searchParams.get("subtab");
  const rangeParam = searchParams.get("range");

  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? tabParam!
    : DEFAULT_TAB;
  const activeSubTab = VALID_SUBTABS.includes(subtabParam as AnalyticsSubTab)
    ? (subtabParam as AnalyticsSubTab)
    : DEFAULT_SUBTAB;
  const timeRange =
    rangeParam && !isNaN(parseInt(rangeParam))
      ? (parseInt(rangeParam) as TimeRange)
      : DEFAULT_RANGE;

  // Update URL without full navigation
  const updateUrl = useCallback(
    (updates: { tab?: string; subtab?: string; range?: number }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.tab !== undefined) {
        if (updates.tab === DEFAULT_TAB) {
          params.delete("tab");
        } else {
          params.set("tab", updates.tab);
        }
        // Clear subtab when switching to non-analytics tab
        if (updates.tab !== "analytics") {
          params.delete("subtab");
        }
      }

      if (updates.subtab !== undefined) {
        if (updates.subtab === DEFAULT_SUBTAB) {
          params.delete("subtab");
        } else {
          params.set("subtab", updates.subtab);
        }
      }

      if (updates.range !== undefined) {
        if (updates.range === DEFAULT_RANGE) {
          params.delete("range");
        } else {
          params.set("range", String(updates.range));
        }
      }

      const queryString = params.toString();
      router.replace(`/admin${queryString ? `?${queryString}` : ""}`, {
        scroll: false,
      });
    },
    [searchParams, router]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      updateUrl({ tab });
    },
    [updateUrl]
  );

  const handleSubTabChange = useCallback(
    (subtab: AnalyticsSubTab) => {
      updateUrl({ subtab });
    },
    [updateUrl]
  );

  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      updateUrl({ range });
    },
    [updateUrl]
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-4 md:px-8 lg:px-12 pt-24 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800">
              <Activity className="h-5 w-5 text-zinc-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Admin Dashboard</h1>
              <p className="text-xs text-zinc-500">Platform analytics & monitoring</p>
            </div>
          </div>

          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-zinc-500">Live</span>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="h-10 p-1 bg-zinc-900 border border-zinc-800 rounded-lg lg:w-auto lg:inline-flex">
            <TabsTrigger
              value="analytics"
              className="gap-2 h-8 px-4 text-sm rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="gap-2 h-8 px-4 text-sm rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger
              value="inspect"
              className="gap-2 h-8 px-4 text-sm rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Search className="h-4 w-4" />
              Inspect
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-4">
            <AnalyticsDashboard
              activeSubTab={activeSubTab}
              onSubTabChange={handleSubTabChange}
              timeRange={timeRange}
              onTimeRangeChange={handleRangeChange}
            />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-4">
            <UsersTab range={timeRange} />
          </TabsContent>

          {/* Inspect Tab */}
          <TabsContent value="inspect" className="mt-4">
            <InspectTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
