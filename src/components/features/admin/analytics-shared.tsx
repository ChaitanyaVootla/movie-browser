"use client";

import { useState, useCallback } from "react";
import { LucideIcon, Check, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// =============================================================================
// Premium Card Wrapper
// =============================================================================

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: "cyan" | "violet" | "emerald" | "amber" | "rose" | "zinc";
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

const cardAccents = {
  cyan: "hover:border-cyan-500/20 hover:shadow-cyan-500/5",
  violet: "hover:border-violet-500/20 hover:shadow-violet-500/5",
  emerald: "hover:border-emerald-500/20 hover:shadow-emerald-500/5",
  amber: "hover:border-amber-500/20 hover:shadow-amber-500/5",
  rose: "hover:border-rose-500/20 hover:shadow-rose-500/5",
  zinc: "hover:border-zinc-600/30",
};

const iconColors = {
  cyan: "text-cyan-400 bg-cyan-500/10",
  violet: "text-violet-400 bg-violet-500/10",
  emerald: "text-emerald-400 bg-emerald-500/10",
  amber: "text-amber-400 bg-amber-500/10",
  rose: "text-rose-400 bg-rose-500/10",
  zinc: "text-zinc-400 bg-zinc-500/10",
};

export function PremiumCard({
  children,
  className,
  accentColor = "zinc",
  title,
  icon: Icon,
  action,
}: PremiumCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm",
        "transition-all duration-300 shadow-lg",
        cardAccents[accentColor],
        className
      )}
    >
      {(title || Icon || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={cn("p-2 rounded-lg", iconColors[accentColor])}>
                <Icon className="h-4 w-4" />
              </div>
            )}
            {title && (
              <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// =============================================================================
// Empty State (Premium)
// =============================================================================

interface EmptyStateProps {
  message?: string;
  height?: number | string;
  className?: string;
  icon?: LucideIcon;
}

export function EmptyState({
  message = "No data available",
  height = 120,
  className,
  icon: Icon,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-zinc-500",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {Icon && (
        <div className="p-3 rounded-xl bg-zinc-800/30 mb-3">
          <Icon className="h-5 w-5 text-zinc-500" />
        </div>
      )}
      <p className="text-sm">{message}</p>
    </div>
  );
}

// =============================================================================
// Compact Stat (Premium Badge Style)
// =============================================================================

interface CompactStatProps {
  label: string;
  value: number | undefined | null;
  format?: "number" | "currency" | "percentage";
  suffix?: string;
  icon?: LucideIcon;
  variant?: "default" | "destructive" | "warning";
  isLoading: boolean;
}

export function CompactStat({
  label,
  value,
  format = "number",
  suffix,
  icon: Icon,
  variant = "default",
  isLoading,
}: CompactStatProps) {
  const formatValue = (v: number) => {
    switch (format) {
      case "currency":
        return `$${v.toFixed(2)}`;
      case "percentage":
        return `${v.toFixed(1)}%`;
      default:
        return v.toLocaleString();
    }
  };

  const variantStyles = {
    default: "border-zinc-800/50 bg-zinc-900/40",
    destructive: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
  };

  const textStyles = {
    default: "text-zinc-100",
    destructive: "text-red-400",
    warning: "text-amber-400",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm transition-all duration-200",
        "hover:bg-zinc-800/40",
        variantStyles[variant]
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500" />}
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      {isLoading ? (
        <Skeleton className="h-4 w-10 bg-zinc-800" />
      ) : (
        <span className={cn("text-sm font-semibold font-mono", textStyles[variant])}>
          {value !== null && value !== undefined ? formatValue(value) : "—"}
        </span>
      )}
      {suffix && <span className="text-[10px] text-zinc-500">{suffix}</span>}
    </div>
  );
}

// =============================================================================
// Premium Loading Skeleton
// =============================================================================

interface PremiumSkeletonProps {
  className?: string;
  variant?: "card" | "chart" | "table" | "stat";
}

export function PremiumSkeleton({ className, variant = "card" }: PremiumSkeletonProps) {
  switch (variant) {
    case "chart":
      return (
        <div className={cn("space-y-3", className)}>
          <div className="flex items-end gap-1 h-32">
            {[65, 42, 88, 35, 72, 51, 93, 38, 77, 45, 82, 56].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-zinc-800/50 rounded-t animate-pulse"
                style={{
                  height: `${h}%`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-12 bg-zinc-800/50" />
            <Skeleton className="h-3 w-12 bg-zinc-800/50" />
          </div>
        </div>
      );
    case "table":
      return (
        <div className={cn("space-y-2", className)}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-pulse"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <Skeleton className="h-4 w-16 bg-zinc-800/50" />
              <Skeleton className="h-4 flex-1 bg-zinc-800/30" />
              <Skeleton className="h-4 w-12 bg-zinc-800/50" />
            </div>
          ))}
        </div>
      );
    case "stat":
      return (
        <div className={cn("space-y-3", className)}>
          <Skeleton className="h-8 w-8 rounded-lg bg-zinc-800/50" />
          <Skeleton className="h-7 w-20 bg-zinc-800/50" />
          <Skeleton className="h-3 w-14 bg-zinc-800/30" />
        </div>
      );
    default:
      return (
        <div className={cn("space-y-3 p-4", className)}>
          <Skeleton className="h-4 w-24 bg-zinc-800/50" />
          <Skeleton className="h-20 w-full bg-zinc-800/30" />
        </div>
      );
  }
}

// =============================================================================
// Copyable Text (with tooltip showing full value + copy feedback)
// =============================================================================

interface CopyableTextProps {
  text: string;
  displayText?: string;
  maxLength?: number;
  className?: string;
}

export function CopyableText({ text, displayText, maxLength = 12, className }: CopyableTextProps) {
  const [copied, setCopied] = useState(false);
  const truncated =
    displayText || (text.length > maxLength ? `${text.slice(0, maxLength)}...` : text);
  const isTruncated = text.length > maxLength || displayText !== undefined;

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    },
    [text]
  );

  const content = (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md cursor-pointer transition-all duration-200",
        "bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50",
        copied && "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
        className
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <code className="font-mono text-zinc-300">{truncated}</code>
          <Copy className="h-3 w-3 text-zinc-500" />
        </>
      )}
    </button>
  );

  if (!isTruncated) {
    return content;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-zinc-900 border-zinc-700 rounded-lg shadow-xl"
        >
          <div className="space-y-2 p-1">
            <p className="text-[10px] text-zinc-400 flex items-center gap-1.5">
              <Copy className="h-3 w-3" /> Click to copy full ID
            </p>
            <code className="text-xs break-all font-mono text-zinc-200 block bg-zinc-800/50 px-2 py-1 rounded">
              {text}
            </code>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// =============================================================================
// Stat Indicator (for change values)
// =============================================================================

interface StatIndicatorProps {
  value: number;
  suffix?: string;
  inverted?: boolean; // true = decrease is good (like errors)
}

export function StatIndicator({ value, suffix = "%", inverted = false }: StatIndicatorProps) {
  const isPositive = inverted ? value < 0 : value > 0;
  const isNegative = inverted ? value > 0 : value < 0;

  return (
    <span
      className={cn(
        "text-[10px] font-medium",
        isPositive && "text-emerald-400",
        isNegative && "text-red-400",
        !isPositive && !isNegative && "text-zinc-500"
      )}
    >
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

// =============================================================================
// Time Ago Helper
// =============================================================================

export function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// =============================================================================
// Format Alert Value
// =============================================================================

export function formatAlertValue(value: number | string): string {
  if (typeof value === "number") {
    if (value < 1 && value > 0) return value.toFixed(3);
    if (value >= 1000) return value.toLocaleString();
    return String(value);
  }
  return String(value);
}

// =============================================================================
// Format Bytes
// =============================================================================

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// =============================================================================
// Format Date (for charts)
// =============================================================================

export function formatChartDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// =============================================================================
// Format Duration
// =============================================================================

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// =============================================================================
// Number Abbreviation
// =============================================================================

export function abbreviateNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}
