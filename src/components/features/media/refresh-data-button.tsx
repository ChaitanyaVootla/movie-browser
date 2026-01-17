"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RefreshDataButtonProps {
  tmdbId: number;
  mediaType: "movie" | "series";
  className?: string;
}

type RefreshStatus = "idle" | "loading" | "success" | "error";

/**
 * Admin-only button to force refresh data from TMDB + MongoDB/Lambda.
 * Bypasses staleness checks - useful for testing and manual updates.
 */
export function RefreshDataButton({ tmdbId, mediaType, className }: RefreshDataButtonProps) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Only show to admins
  if (!isAdmin) return null;

  const handleRefresh = async () => {
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/refresh-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Refresh failed");
      }

      setStatus("success");
      // Refresh the page after a brief delay to show success state
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      // Reset to idle after a few seconds
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  const getIcon = () => {
    switch (status) {
      case "loading":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "success":
        return <Check className="h-3 w-3" />;
      case "error":
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <RefreshCw className="h-3 w-3" />;
    }
  };

  const getLabel = () => {
    switch (status) {
      case "loading":
        return "Refreshing...";
      case "success":
        return "Refreshed";
      case "error":
        return "Failed";
      default:
        return "Refresh";
    }
  };

  const button = (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRefresh}
      disabled={status === "loading"}
      className={cn(
        "h-7 px-2 gap-1.5 text-[11px] font-medium",
        "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5",
        "border border-transparent hover:border-white/10",
        "transition-all duration-200",
        status === "success" && "text-emerald-400/70 hover:text-emerald-400",
        status === "error" && "text-red-400/70 hover:text-red-400",
        className
      )}
    >
      {getIcon()}
      {getLabel()}
    </Button>
  );

  // Show tooltip with help text or error message
  const tooltipContent =
    status === "error" && errorMessage ? errorMessage : "Force refresh from TMDB + MongoDB";

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className={cn("text-xs", status === "error" && "text-red-400")}>{tooltipContent}</p>
      </TooltipContent>
    </Tooltip>
  );
}
