"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Section a flattened suggestion item belongs to (for visual grouping). */
export type MentionSection = "People" | "Titles" | "Cast / People" | "Episodes";

/** A single flattened, selectable suggestion in render order. */
export interface MentionSuggestionItem {
  key: string;
  section: MentionSection;
  label: string;
  sublabel?: string;
  imageSrc?: string;
  /** The attrs written into the inserted mention node (drives serialization + chip). */
  attrs: {
    kind: "user" | "movie" | "series" | "person" | "episode";
    id: string;
    label: string;
    season?: number | null;
    episode?: number | null;
    imageSrc?: string | null;
  };
}

export interface MentionListHandle {
  /** Returns true if the key was consumed (arrow/enter/tab/esc). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface MentionListProps {
  items: MentionSuggestionItem[];
  loading?: boolean;
  command: (item: MentionSuggestionItem) => void;
}

/**
 * Keyboard-navigable, sectioned suggestion popup for the `@` mention. Driven
 * imperatively by Tiptap's suggestion `render` (ReactRenderer + floating-ui).
 * 40px+ touch rows, semantic tokens, no hardcoded colors. Mobile-usable at 390px
 * (the popup is width-capped + scrolls).
 */
export const MentionSuggestionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionSuggestionList({ items, loading, command }, ref) {
    // Track the highlight by item KEY (not index): when the result set changes the
    // key usually vanishes, so we fall back to the top — a reset with no effect/ref.
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const activeIndex = Math.max(0, items.findIndex((i) => i.key === activeKey));
    const move = (delta: number) => {
      if (!items.length) return;
      const next = (activeIndex + delta + items.length) % items.length;
      setActiveKey(items[next].key);
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
          // Swallow Enter while loading/empty so it neither submits nor newlines.
          return loading || items.length === 0;
        }
        if (event.key === "Escape") return true;
        return false;
      },
    }));

    if (loading && items.length === 0) {
      return (
        <div className="w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground shadow-lg">
          Searching…
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground shadow-lg">
          No matches.
        </div>
      );
    }

    return (
      <div
        className="w-72 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
        role="listbox"
        aria-label="Mention suggestions"
      >
        {items.map((item, index) => {
          // Show the section heading before the first item of each section.
          const heading = items[index - 1]?.section !== item.section ? item.section : null;
          const isPerson = item.attrs.kind === "person" || item.attrs.kind === "user";
          return (
            <div key={item.key}>
              {heading && (
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {heading}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 text-left min-h-[40px] transition-colors",
                  "hover:bg-accent focus:bg-accent focus:outline-none",
                  index === activeIndex && "bg-accent"
                )}
                onMouseEnter={() => setActiveKey(item.key)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
              >
                {item.imageSrc ? (
                  <span
                    className={cn(
                      "relative h-7 w-7 flex-shrink-0 overflow-hidden bg-muted",
                      isPerson ? "rounded-full" : "rounded-[3px]"
                    )}
                  >
                    <Image src={item.imageSrc} alt="" fill sizes="28px" className="object-cover" unoptimized />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "h-7 w-7 flex-shrink-0 bg-muted",
                      isPerson ? "rounded-full" : "rounded-[3px]"
                    )}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  {item.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }
);
