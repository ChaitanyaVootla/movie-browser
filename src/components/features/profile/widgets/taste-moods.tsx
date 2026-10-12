import { Sparkles } from "lucide-react";
import type { FacetStat } from "@/lib/taste/lift";
import { isNeutralMoodFacet } from "@/lib/taste/lift";
import { MoodChip } from "../taste/mood-chip";
import { WidgetCard } from "./widget-card";

/**
 * Moods & themes: lifted AI THEME/VIBE/MOOD tags as chips with counts. Tapping
 * a chip shows the titles behind it — Popover on desktop, Vaul Drawer (with
 * Back-to-dismiss) on mobile (`MoodChip` → `ExploreTrigger`). The three
 * strongest tags carry the AI-tag brand tint; the rest stay muted. Neutral
 * mid-scale values ("Medium intensity") never display.
 */
export function TasteMoodsWidget({ moods }: { moods: FacetStat[] }) {
  const shown = moods.filter((m) => !isNeutralMoodFacet(m));
  if (shown.length === 0) return null;
  return (
    <WidgetCard title="Moods & themes" icon={<Sparkles className="h-4 w-4" />}>
      <ul className="flex flex-wrap gap-2">
        {shown.map((f, i) => (
          <li key={`${f.type}:${f.key}`}>
            <MoodChip facet={f} tinted={i < 3} />
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
