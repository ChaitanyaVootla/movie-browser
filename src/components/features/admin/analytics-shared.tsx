"use client";

import { useState, useCallback } from "react";
import { LucideIcon, Check, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StatVariant } from "./analytics-types";

// =============================================================================
// Empty State
// =============================================================================

interface EmptyStateProps {
  message?: string;
  height?: number | string;
  className?: string;
}

export function EmptyState({
  message = "No data available",
  height = 120,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center text-muted-foreground text-sm",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {message}
    </div>
  );
}

// =============================================================================
// Compact Stat (Inline metric display)
// =============================================================================

interface CompactStatProps {
  label: string;
  value: number | undefined | null;
  format?: "number" | "currency" | "percentage";
  suffix?: string;
  icon?: LucideIcon;
  variant?: StatVariant;
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

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card",
        variant === "destructive" && "border-red-500/50 bg-red-500/5",
        variant === "warning" && "border-amber-500/50 bg-amber-500/5"
      )}
    >
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      <span className="text-[10px] uppercase text-muted-foreground">
        {label}
      </span>
      {isLoading ? (
        <Skeleton className="h-4 w-8" />
      ) : (
        <span
          className={cn(
            "text-sm font-semibold",
            variant === "destructive" && "text-red-500",
            variant === "warning" && "text-amber-500"
          )}
        >
          {value !== null && value !== undefined ? formatValue(value) : "—"}
        </span>
      )}
      {suffix && (
        <span className="text-[10px] text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
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

export function CopyableText({
  text,
  displayText,
  maxLength = 12,
  className,
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);
  const truncated =
    displayText ||
    (text.length > maxLength ? `${text.slice(0, maxLength)}...` : text);
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
        "inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded cursor-pointer transition-all",
        "hover:bg-muted/80 active:scale-95",
        copied && "bg-green-500/20 text-green-500",
        className
      )}
    >
      {copied ? (
        <>
          <Check className="h-2.5 w-2.5" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <code className="font-mono">{truncated}</code>
          <Copy className="h-2.5 w-2.5 opacity-50" />
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
          className="max-w-xs bg-zinc-900 border-zinc-700"
        >
          <div className="space-y-1.5">
            <p className="text-[10px] text-zinc-400 flex items-center gap-1">
              <Copy className="h-2.5 w-2.5" /> Click to copy full ID
            </p>
            <code className="text-xs break-all font-mono text-zinc-200 block">
              {text}
            </code>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
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
