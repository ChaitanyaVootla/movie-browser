"use client";

import { useState } from "react";
import { Users, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDashboard } from "@/components/features/admin";
import { UsersTab } from "@/components/features/admin/tabs";
import type { TimeRange } from "@/components/features/admin/analytics-types";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [timeRange, setTimeRange] = useState<TimeRange>(7);

  return (
    <div className="px-4 md:px-8 lg:px-12 pt-24 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
      </div>

      {/* Main Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
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
          <AnalyticsDashboard />
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <UsersTab range={timeRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
