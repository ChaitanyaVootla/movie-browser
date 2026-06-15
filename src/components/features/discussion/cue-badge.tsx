import { Sparkles } from "lucide-react";

/** AI-authored marker for Cue's comments (spec §8 transparency requirement). */
export function CueBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary " +
        (className ?? "")
      }
    >
      <Sparkles className="size-3" aria-hidden />
      AI
    </span>
  );
}
