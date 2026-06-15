"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";
import type { MentionListHandle } from "./mention-suggestion-list";

/** Minimal shape we consume from the emoji extension's EmojiItem. */
export interface EmojiSuggestion {
  name: string;
  emoji?: string;
  shortcodes: string[];
  fallbackImage?: string;
}

interface EmojiListProps {
  items: EmojiSuggestion[];
  command: (item: EmojiSuggestion) => void;
}

/**
 * Keyboard-navigable `:shortcode` emoji suggestion popup (Tiptap suggestion render).
 * Shows the glyph + primary shortcode; 40px+ rows; semantic tokens.
 */
export const EmojiSuggestionListView = forwardRef<MentionListHandle, EmojiListProps>(
  function EmojiSuggestionListView({ items, command }, ref) {
    // Track the highlight by emoji name (see MentionSuggestionList for the rationale).
    const [activeName, setActiveName] = useState<string | null>(null);
    const activeIndex = Math.max(0, items.findIndex((i) => i.name === activeName));
    const move = (delta: number) => {
      if (!items.length) return;
      const next = (activeIndex + delta + items.length) % items.length;
      setActiveName(items[next].name);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          move(1);
          return true;
        }
        if (event.key === "ArrowUp") {
          move(-1);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[activeIndex];
          if (item) {
            command(item);
            return true;
          }
          return items.length === 0;
        }
        if (event.key === "Escape") return true;
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground shadow-lg">
          No emoji.
        </div>
      );
    }

    return (
      <div
        className="w-56 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
        role="listbox"
        aria-label="Emoji suggestions"
      >
        {items.map((item, index) => (
          <button
            key={item.name}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 text-left min-h-[40px] transition-colors",
              "hover:bg-accent focus:bg-accent focus:outline-none",
              index === activeIndex && "bg-accent"
            )}
            onMouseEnter={() => setActiveName(item.name)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(item)}
          >
            <span className="text-lg leading-none">
              {item.emoji ?? (item.fallbackImage ? "🖼️" : "·")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">:{item.shortcodes[0] ?? item.name}:</span>
          </button>
        ))}
      </div>
    );
  }
);
