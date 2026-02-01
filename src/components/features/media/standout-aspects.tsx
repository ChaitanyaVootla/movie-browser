/**
 * Standout Aspects - Visual highlights for production quality
 *
 * Displays what makes this movie technically/artistically standout.
 * Uses icons and cards for visual interest while staying clean.
 */

import {
  Music,
  Volume2,
  Theater,
  Clapperboard,
  Camera,
  Sparkles,
  Wrench,
  PenTool,
  Film,
  Building2,
  Shirt,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HighlightItem {
  subcategory: string;
  text: string;
}

interface StandoutAspectsProps {
  highlights: HighlightItem[];
  className?: string;
  maxItems?: number;
}

// Config with icons and labels
const HIGHLIGHT_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  score: { icon: Music, label: "Score" },
  sound: { icon: Volume2, label: "Sound" },
  acting: { icon: Theater, label: "Acting" },
  direction: { icon: Clapperboard, label: "Direction" },
  cinematography: { icon: Camera, label: "Cinematography" },
  vfx: { icon: Sparkles, label: "Visual Effects" },
  practical: { icon: Wrench, label: "Practical Effects" },
  writing: { icon: PenTool, label: "Writing" },
  editing: { icon: Film, label: "Editing" },
  production: { icon: Building2, label: "Production" },
  costume: { icon: Shirt, label: "Costume" },
  stunt: { icon: Flame, label: "Stunts" },
};

export function StandoutAspects({
  highlights,
  className,
  maxItems = 4,
}: StandoutAspectsProps) {
  if (!highlights?.length) return null;

  const displayItems = highlights.slice(0, maxItems);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Section header */}
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Standout Aspects</h3>

      {/* Grid of highlight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {displayItems.map((item, index) => {
          const config = HIGHLIGHT_CONFIG[item.subcategory];
          const Icon = config?.icon;
          const label = config?.label ?? item.subcategory;

          return (
            <div
              key={`${item.subcategory}-${index}`}
              className="flex gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5"
            >
              {Icon && (
                <div className="flex-shrink-0 w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-brand" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground/90 mb-0.5">{label}</p>
                <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
