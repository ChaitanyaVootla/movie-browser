"use client";

import { MessageSquarePlus, Sparkles } from "lucide-react";
import { WebReactions } from "./web-reactions";
import { DISCUSSION_STARTER_PROMPTS } from "./starter-prompts";

interface DiscussionEmptyStateProps {
  /**
   * Kept for backward-compat but IGNORED — the component always renders the
   * static set from `starter-prompts.ts`. Pass `[]` (or omit) from call-sites;
   * AI-sourced prompts are no longer used here (cost-safety invariant 6).
   */
  starters?: string[];
  /** Seed the composer + open it. */
  onPick: (prompt: string) => void;
  /** Whether the viewer can post (drives copy only). */
  signedIn: boolean;
  /** Trailer top-comments JSON for "From around the web" (degrades to nothing). */
  webReactionsRaw?: unknown;
}

/**
 * Inviting "start the conversation" card shown when a thread has zero comments.
 * Replaces the old near-blank box: a headline, tappable starter chips that seed
 * the composer, and (when available) real reactions from the web so a fresh
 * thread never feels dead. Fully client-side — sits below the cacheable header.
 */
export function DiscussionEmptyState({
  onPick,
  signedIn,
  webReactionsRaw,
}: DiscussionEmptyStateProps) {
  const prompts = DISCUSSION_STARTER_PROMPTS.slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-brand">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold">Start the conversation</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn
            ? "No comments yet — kick things off. Pick a prompt or write your own."
            : "No comments yet. Sign in to be the first — pick a prompt to get started."}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-background/60 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:border-brand/50 hover:bg-accent"
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0 text-brand" />
              <span className="flex-1">{prompt}</span>
              <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                Write →
              </span>
            </button>
          ))}
        </div>
      </div>

      <WebReactions raw={webReactionsRaw} />
    </div>
  );
}
