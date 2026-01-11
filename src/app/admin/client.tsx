"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDashboard } from "@/components/features/admin";
import { UsersTab } from "@/components/features/admin/tabs";
import type { TimeRange, AnalyticsSubTab } from "@/components/features/admin/analytics-types";

const VALID_TABS = ["analytics", "users"] as const;
const VALID_SUBTABS: AnalyticsSubTab[] = ["traffic", "ai", "lambda", "performance", "system", "database"];
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

  const activeTab = VALID_TABS.includes(tabParam as typeof VALID_TABS[number])
    ? tabParam!
    : DEFAULT_TAB;
  const activeSubTab = VALID_SUBTABS.includes(subtabParam as AnalyticsSubTab)
    ? (subtabParam as AnalyticsSubTab)
    : DEFAULT_SUBTAB;
  const timeRange = rangeParam && !isNaN(parseInt(rangeParam))
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
    <div className="px-4 md:px-8 lg:px-12 pt-24 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
      </div>

      {/* Main Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-flex">
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <AnalyticsDashboard
            activeSubTab={activeSubTab}
            onSubTabChange={handleSubTabChange}
            timeRange={timeRange}
            onTimeRangeChange={handleRangeChange}
          />
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <UsersTab range={timeRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
