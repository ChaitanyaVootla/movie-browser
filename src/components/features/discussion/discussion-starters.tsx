"use client";

import { MessageSquarePlus } from "lucide-react";

/**
 * AI discussion prompts seeded from ai_insights (spoiler-free questions +
 * themes — the corpus the spec says we uniquely have). Clicking seeds the
 * composer. Rendered in cacheable HTML: prompts are content-derived, never
 * user-derived.
 */
export function DiscussionStarters({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Discussion starters
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.slice(0, 4).map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/60 transition-colors text-left min-h-10"
          >
            <MessageSquarePlus className="h-3 w-3 shrink-0" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
