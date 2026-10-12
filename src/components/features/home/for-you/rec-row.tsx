"use client";

/**
 * One rec row (spec §3.2). Cards stay `MediaCard` (display-only); the rec
 * layer is the WRAPPER: "Not for me" button + the anchor tag under the card.
 * Dismiss collapses the card (WAAPI 220ms; instant with reduced motion) before
 * the parent drops it.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { MediaCard } from "@/components/features/movie/media-card";
import { tuneToTokens } from "@/lib/taste/tune-tokens";
import type { RecItemDTO, RecReason, RecRowDTO } from "@/lib/taste/recommend-types";
import { AnchorTag } from "./anchor-tag";
import { NotForMeButton } from "./not-for-me-button";
import { BecauseHeading, SeedHeading } from "./rec-row-heading";
import { refKey, tagFor, toListItem } from "./rec-copy";

export const POSTER_CARD = "w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0";
export const WIDE_CARD = "w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0";
const COLLAPSE_MS = 220;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Collapse a card wrapper in place, then call `done` (also when animation is unavailable). */
function collapse(el: HTMLElement | null, done: () => void) {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return done();
  const w = el.getBoundingClientRect().width;
  el.style.overflow = "hidden";
  const anim = el.animate(
    [
      { width: `${w}px`, opacity: 1, marginRight: "0px" },
      { width: "0px", opacity: 0, marginRight: "-16px" },
    ],
    { duration: COLLAPSE_MS, easing: "ease-out", fill: "forwards" }
  );
  anim.onfinish = done;
  anim.oncancel = done;
}

export interface RecRowProps {
  row: RecRowDTO;
  reason: RecReason;
  /** for_you only: heading node (title + sub-line) and trailing action. */
  heading?: ReactNode;
  headingAction?: ReactNode;
  subheader?: ReactNode;
  dimmed?: boolean;
  onWhy: (item: RecItemDTO, row: RecRowDTO, el: HTMLElement | null) => void;
  onWhyRow: (row: RecRowDTO, el: HTMLElement | null) => void;
  onDismiss: (item: RecItemDTO, row: RecRowDTO) => void;
  onRemoveSeed?: (rowId: string) => void;
  empty?: ReactNode;
}

export function RecRow({ row, reason, heading, headingAction, subheader, dimmed, onWhy, onWhyRow, onDismiss, onRemoveSeed, empty }: RecRowProps) {
  const { trackAction } = useAnalytics();
  const tracked = useRef<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const thumbsRef = useRef<HTMLButtonElement>(null);

  const signature = `${row.id}:${row.items.map(refKey).join(",")}`;
  useEffect(() => {
    if (tracked.current === signature || row.items.length === 0) return;
    const first = tracked.current === null;
    tracked.current = signature;
    if (!first && row.kind !== "for_you") return; // re-impress only when a tune/shuffle redraws For-you
    trackAction({
      action: "rec_impression",
      metadata: {
        row: row.id,
        source: row.items[0]?.source,
        reason,
        count: row.items.length,
        ids: row.items.map(refKey),
        tune: tuneToTokens(row.tune),
        anchors: row.anchors.map(refKey),
      },
    });
  }, [signature, row, reason, trackAction]);

  const title =
    row.kind === "because" ? (
      <BecauseHeading row={row} thumbsRef={thumbsRef} onOpenRow={() => onWhyRow(row, thumbsRef.current)} />
    ) : row.kind === "seed" ? (
      <SeedHeading row={row} />
    ) : (
      heading
    );
  const action =
    row.kind === "seed" && onRemoveSeed ? (
      <Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Remove row" onClick={() => onRemoveSeed(row.id)}>
        <X className="size-4" />
      </Button>
    ) : (
      headingAction
    );

  return (
    <section id={row.kind === "for_you" ? "for-you" : undefined} className="scroll-mt-20 space-y-2">
      <MediaScroller
        title={title}
        headingAction={action}
        subheader={subheader}
        contentPadding=""
        showControls={row.items.length > 4}
        className={dimmed ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}
      >
        {row.items.length === 0 && empty}
        {row.items.map((it, position) => {
          const key = refKey(it);
          const tag = tagFor(it, row);
          return (
            <div
              key={key}
              ref={(el) => {
                if (el) cardRefs.current.set(key, el);
                else cardRefs.current.delete(key);
              }}
              className="group/rec relative flex-shrink-0"
              onClickCapture={() =>
                trackAction({
                  action: "rec_click",
                  mediaType: it.mediaType,
                  itemId: it.id,
                  itemTitle: it.title,
                  metadata: { row: row.id, source: it.source, position, explanation: it.explanation?.kind ?? null },
                })
              }
            >
              <MediaCard item={toListItem(it)} className={POSTER_CARD} wideClassName={WIDE_CARD} />
              <NotForMeButton title={it.title} onDismiss={() => collapse(cardRefs.current.get(key) ?? null, () => onDismiss(it, row))} />
              {tag && (
                <div className="mt-1.5 w-0 min-w-full">
                  <AnchorTag tag={tag} onOpen={() => onWhy(it, row, cardRefs.current.get(key) ?? null)} />
                </div>
              )}
            </div>
          );
        })}
      </MediaScroller>
    </section>
  );
}
