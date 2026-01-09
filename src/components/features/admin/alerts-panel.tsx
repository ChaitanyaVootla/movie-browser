"use client";

import {
  AlertCircle,
  AlertTriangle,
  Info,
  Bot,
  Gauge,
  TrendingDown,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  value: number | string;
  threshold: number | string;
  detectedAt: string;
}

interface AlertsPanelProps {
  alerts: Alert[];
  isLoading: boolean;
}

// =============================================================================
// Severity & Category Config
// =============================================================================

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    label: "Info",
  },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ai: Bot,
  errors: AlertTriangle,
  performance: Gauge,
  traffic: TrendingDown,
  cache: Database,
};

// =============================================================================
// Component
// =============================================================================

export function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  // Don't show anything while loading if we don't know if there are alerts
  if (isLoading) {
    return null;
  }

  // Only show panel when there are actual alerts
  if (alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return (
    <Card
      className={cn(
        criticalCount > 0 && "border-red-500/50",
        criticalCount === 0 && warningCount > 0 && "border-amber-500/50"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {criticalCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            System Alerts
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                {warningCount} warning
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Alert Item
// =============================================================================

function AlertItem({ alert }: { alert: Alert }) {
  const config = SEVERITY_CONFIG[alert.severity];
  const SeverityIcon = config.icon;
  const CategoryIcon = CATEGORY_ICONS[alert.category] || AlertTriangle;

  const timeAgo = getTimeAgo(alert.detectedAt);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className={cn("mt-0.5 shrink-0", config.color)}>
        <SeverityIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("font-medium text-sm", config.color)}>{alert.title}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
            <CategoryIcon className="h-3 w-3" />
            {alert.category}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{alert.message}</p>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>
            Value: <span className="font-medium text-foreground">{formatValue(alert.value)}</span>
          </span>
          <span>
            Threshold: <span className="font-medium">{formatValue(alert.threshold)}</span>
          </span>
          <span className="ml-auto">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    if (value < 1 && value > 0) return value.toFixed(3);
    if (value >= 1000) return value.toLocaleString();
    return String(value);
  }
  return String(value);
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}


