import type { FacetStat } from "@/lib/taste/lift";
import { cn } from "@/lib/utils";
import { EvidenceGrid } from "./evidence-grid";
import { ExploreTrigger } from "./explore-trigger";
import { moodEvidenceLine } from "./taste-copy";

/**
 * One mood/theme chip that opens its evidence (the titles carrying it). Shared
 * by the Moods & themes widget and the Taste card's top-3 row. The dotted
 * underline is the tappable cue (no extra glyph — DESIGN.md → Taste profile).
 */
export function MoodChip({ facet, tinted }: { facet: FacetStat; tinted: boolean }) {
  return (
    <ExploreTrigger
      tap="mood"
      title={facet.label}
      description={moodEvidenceLine(facet)}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:min-h-8",
        "aria-expanded:ring-2 aria-expanded:ring-brand/60",
        tinted ? "bg-brand/15 text-brand hover:bg-brand/25" : "bg-muted text-muted-foreground hover:text-foreground"
      )}
      label={
        <>
          <span className="underline decoration-dotted underline-offset-4">{facet.label}</span>
          <span className="tabular-nums opacity-70">{facet.count}</span>
        </>
      }
    >
      <EvidenceGrid titles={facet.titles} />
    </ExploreTrigger>
  );
}
