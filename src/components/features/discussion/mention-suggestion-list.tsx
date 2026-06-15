"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
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
    const [active, setActive] = useState(0);

    // Reset/clamp the highlight whenever the result set changes.
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

    let lastSection: MentionSection | null = null;
    return (
      <div
        className="w-72 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
        role="listbox"
        aria-label="Mention suggestions"
      >
        {items.map((item, index) => {
          const heading = item.section !== lastSection ? item.section : null;
          lastSection = item.section;
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
