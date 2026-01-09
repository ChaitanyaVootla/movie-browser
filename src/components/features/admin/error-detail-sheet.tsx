"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Code,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Monitor,
  User,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyableText, getTimeAgo } from "./analytics-shared";
import { cn } from "@/lib/utils";
import type { TimeRange } from "./analytics-types";

// =============================================================================
// Types
// =============================================================================

interface ErrorDetailData {
  eventId: string;
  timestamp: string;
  sessionId: string;
  userId: string | null;
  country: string;
  userAgent: string;
  errorSource: string;
  errorType: string;
  errorMessage: string;
  errorStack: string | null;
  route: string | null;
  component: string | null;
  context: Record<string, unknown>;
  severity: string;
}

interface ErrorOccurrence {
  timestamp: string;
  sessionId: string;
  country: string;
  route: string | null;
  severity: string;
}

interface ErrorDetailResponse {
  detail: ErrorDetailData | null;
  occurrences: ErrorOccurrence[];
  totalCount: number;
}

interface ErrorDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorType: string;
  errorSource: string;
  range: TimeRange;
  totalCount?: number;
}

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchErrorDetail(
  errorType: string,
  errorSource: string,
  range: TimeRange
): Promise<ErrorDetailResponse> {
  const params = new URLSearchParams({
    type: "error_detail",
    errorType,
    errorSource,
    range: String(range),
  });
  const res = await fetch(`/api/admin/analytics?${params}`);
  if (!res.ok) throw new Error("Failed to fetch error details");
  return res.json();
}

// =============================================================================
// Error Detail Sheet Component
// =============================================================================

export function ErrorDetailSheet({
  open,
  onOpenChange,
  errorType,
  errorSource,
  range,
  totalCount = 0,
}: ErrorDetailSheetProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "error-detail", errorType, errorSource, range],
    queryFn: () => fetchErrorDetail(errorType, errorSource, range),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-500 bg-red-500/10 border-red-500/30";
      case "high":
        return "text-orange-500 bg-orange-500/10 border-orange-500/30";
      case "medium":
        return "text-amber-500 bg-amber-500/10 border-amber-500/30";
      case "low":
        return "text-blue-500 bg-blue-500/10 border-blue-500/30";
      default:
        return "text-zinc-500 bg-zinc-500/10 border-zinc-500/30";
    }
  };

  const sourceIcon = (source: string) => {
    switch (source) {
      case "client":
        return <Monitor className="h-3 w-3" />;
      case "server":
        return <Code className="h-3 w-3" />;
      case "api":
        return <Globe className="h-3 w-3" />;
      default:
        return <AlertCircle className="h-3 w-3" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-left">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="truncate">{errorType}</span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-left">
            {sourceIcon(errorSource)}
            <span className="capitalize">{errorSource}</span>
            <span>•</span>
            <span>{totalCount || data?.totalCount || 0} occurrences</span>
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Failed to load error details
          </div>
        ) : !data?.detail ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No error details found
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 pb-6">
              {/* Severity & Metadata */}
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn("capitalize", severityColor(data.detail.severity))}
                >
                  {data.detail.severity}
                </Badge>
                {data.detail.route && (
                  <Badge variant="outline" className="gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {data.detail.route}
                  </Badge>
                )}
                {data.detail.component && (
                  <Badge variant="outline" className="gap-1">
                    <Code className="h-3 w-3" />
                    {data.detail.component}
                  </Badge>
                )}
              </div>

              {/* Error Message */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Error Message
                </h4>
                <div className="bg-muted/50 rounded-md p-3 text-sm font-mono break-all">
                  {data.detail.errorMessage}
                </div>
              </div>

              {/* Stack Trace */}
              {data.detail.errorStack && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stack Trace
                  </h4>
                  <div className="bg-zinc-900 rounded-md p-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {data.detail.errorStack}
                  </div>
                </div>
              )}

              {/* Context */}
              {Object.keys(data.detail.context).length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Context
                  </h4>
                  <div className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto">
                    <pre>{JSON.stringify(data.detail.context, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Session & User Info */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Session Info
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <CopyableText
                      text={data.detail.sessionId}
                      displayText={`${data.detail.sessionId.slice(0, 12)}...`}
                      maxLength={12}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span>{data.detail.country}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span>{getTimeAgo(data.detail.timestamp)} ago</span>
                  </div>
                </div>
              </div>

              {/* Recent Occurrences */}
              {data.occurrences.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recent Occurrences ({data.occurrences.length})
                  </h4>
                  <div className="space-y-1">
                    {data.occurrences.slice(0, 10).map((occ, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] h-4 px-1 capitalize",
                              severityColor(occ.severity)
                            )}
                          >
                            {occ.severity}
                          </Badge>
                          {occ.route && (
                            <span className="text-muted-foreground truncate max-w-32">
                              {occ.route}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          {getTimeAgo(occ.timestamp)} ago
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Agent */}
              {data.detail.userAgent && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User Agent
                  </h4>
                  <div className="bg-muted/30 rounded-md px-2 py-1.5 text-xs text-muted-foreground break-all">
                    {data.detail.userAgent}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
