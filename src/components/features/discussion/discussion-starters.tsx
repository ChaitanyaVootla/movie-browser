"use client";

import { MessageSquarePlus } from "lucide-react";
import { DISCUSSION_STARTER_PROMPTS } from "./starter-prompts";

/**
 * Static discussion-starter chips that seed the composer. Prompts come from
 * the static set in `starter-prompts.ts` — never AI-generated (cost-safety
 * invariant 6). The `prompts` prop is kept for backward-compat but IGNORED;
 * call-sites may pass `[]` or omit it.
 */
export function DiscussionStarters({
  onPick,
}: {
  /** Kept for backward-compat — ignored; always uses the static set. */
  prompts?: string[];
  onPick: (prompt: string) => void;
}) {
  const prompts = DISCUSSION_STARTER_PROMPTS.slice(0, 4);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Discussion starters
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
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
