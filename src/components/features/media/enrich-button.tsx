"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EnrichButtonProps {
  tmdbId: number;
  mediaType: "movie" | "series";
  /** If true, wraps button in a container with border-top */
  asFooter?: boolean;
  className?: string;
}

type EnrichStatus = "idle" | "loading" | "success" | "error";

/**
 * Admin-only button to trigger content enrichment.
 * Appears subtle at the bottom of overview sections.
 */
export function EnrichButton({ tmdbId, mediaType, asFooter = false, className }: EnrichButtonProps) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [status, setStatus] = useState<EnrichStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Only show to admins
  if (!isAdmin) return null;

  // Only movies are supported for now
  if (mediaType !== "movie") return null;

  const handleEnrich = async () => {
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Enrichment failed");
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
        return <Sparkles className="h-3 w-3" />;
    }
  };

  const getLabel = () => {
    switch (status) {
      case "loading":
        return "Enriching...";
      case "success":
        return "Done";
      case "error":
        return "Failed";
      default:
        return "Enrich + AI";
    }
  };

  const button = (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleEnrich}
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

  // Show tooltip with error message when there's an error
  const buttonWithTooltip = status === "error" && errorMessage ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="text-xs text-red-400">{errorMessage}</p>
      </TooltipContent>
    </Tooltip>
  ) : button;

  // Wrap in footer container if requested
  if (asFooter) {
    return (
      <div className="flex justify-end px-4 py-2 border-t border-white/5">
        {buttonWithTooltip}
      </div>
    );
  }

  return buttonWithTooltip;
}

