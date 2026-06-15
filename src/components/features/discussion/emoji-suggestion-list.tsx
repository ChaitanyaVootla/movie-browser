"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
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
    const [active, setActive] = useState(0);

    useEffect(() => {
      setActive((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          if (items.length) setActive((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          if (items.length) setActive((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[active];
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
            aria-selected={index === active}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 text-left min-h-[40px] transition-colors",
              "hover:bg-accent focus:bg-accent focus:outline-none",
              index === active && "bg-accent"
            )}
            onMouseEnter={() => setActive(index)}
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
