import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";

export function scopeLabel(
  scope: SpoilerScopeValue,
  scopeSeason: number | null,
  scopeEpisode: number | null
): string | null {
  if (scope === "NONE") return null;
  if (scope === "EPISODE" && scopeSeason !== null) {
    return `Spoilers · S${scopeSeason}${scopeEpisode !== null ? `E${scopeEpisode}` : ""}`;
  }
  if (scope === "ENDING") return "Ending spoilers";
  return "Spoilers";
}

export function ScopeBadge({
  scope,
  scopeSeason,
  scopeEpisode,
  className,
}: {
  scope: SpoilerScopeValue;
  scopeSeason: number | null;
  scopeEpisode: number | null;
  className?: string;
}) {
  const label = scopeLabel(scope, scopeSeason, scopeEpisode);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      <Lock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
