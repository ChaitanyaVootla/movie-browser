"use client";

/**
 * Home "For you" v2 (taste v2 spec 2026-10-12 §3): For you (+ Tune bar, Ask
 * Cue) → seeded "More like" rows → up to two "Because you loved …" rows →
 * taste twins. Cold start shows the calibration deck instead.
 *
 * Client island: the home page is ISR-cached, so recs load per-viewer via POST
 * server actions after hydration (never in cacheable HTML); the only search-
 * param reader is TuneUrlSync inside its own Suspense. Guests see nothing.
 */
import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSafeSession } from "@/hooks/use-safe-session";
import { useAnalytics } from "@/hooks/use-analytics";
import { MediaCardSkeleton } from "@/components/features/movie/media-card";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { CueEntryButton } from "@/components/features/ai/cue-entry";
import type { HomeRecsDTO, RecItemDTO, RecRowDTO } from "@/lib/taste/recommend-types";
import { TasteTwinsStrip } from "../taste-twins-strip";
import { RecRow, POSTER_CARD, WIDE_CARD } from "./rec-row";
import { ForYouHeading } from "./rec-row-heading";
import { TuneBar } from "./tune-bar";
import { TuneUrlSync } from "./tune-url-sync";
import { builtFromLine } from "./rec-copy";
import { useHomeRecs } from "./use-home-recs";
import type { WhyTarget } from "./rec-why-sheet";

const RecWhySheet = dynamic(() => import("./rec-why-sheet"), { ssr: false });
const CalibrationDeck = dynamic(() => import("./calibration-deck"), { ssr: false });

function CardSkeletons() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <MediaCardSkeleton key={i} className={POSTER_CARD} wideClassName={WIDE_CARD} />
      ))}
    </>
  );
}

function RowSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading recommendations">
      <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>For you</SectionHeading>
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-8 w-20 flex-shrink-0 rounded-full bg-muted" />
        ))}
      </div>
      <div className="flex gap-4 overflow-hidden">
        <CardSkeletons />
      </div>
    </section>
  );
}

/** One-time count-up for the sub-line right after calibration (reduced motion: instant). */
function useCountUp(target: number, active: boolean): number {
  const [n, setN] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!active || reduced) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      setN(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduced]);
  return active && !reduced ? n : target;
}

/** Seeded rows grow in under their source row (grid-rows 0fr → 1fr, 260ms). */
function GrowIn({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-[260ms] ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function ColdStart({ onReady }: { onReady: () => void }) {
  return (
    <section className="space-y-4">
      <div>
        <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>Start your taste profile</SectionHeading>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Rate 10 titles you know, about a minute. Picks appear as soon as 3 land.
        </p>
      </div>
      <CalibrationDeck mode="start" onComplete={(r) => r.ready && onReady()} />
    </section>
  );
}

/** Loaded only for signed-in viewers via `for-you-section.tsx` (guests never download it). */
export default function ForYouBody() {
  const { status } = useSafeSession();
  const enabled = status === "authenticated";
  const { recs, rows, tokens, pending, showSkeleton, actions } = useHomeRecs(enabled);
  const [why, setWhy] = useState<{ target: WhyTarget; el: HTMLElement | null } | null>(null);
  const [justCalibrated, setJustCalibrated] = useState(false);
  const positiveCount = useCountUp(recs?.positiveCount ?? 0, justCalibrated);
  /** The why sheet chunk loads on first open only. */
  const [whyLoaded, setWhyLoaded] = useState(false);
  const { trackAction } = useAnalytics();

  if (!enabled) return null;

  const openWhy = (target: WhyTarget, el: HTMLElement | null) => {
    setWhyLoaded(true);
    setWhy({ target, el });
    trackAction({ action: "rec_why_open", metadata: { kind: target.kind, row: target.row.id } });
  };
  const closeWhy = () => setWhy(null);
  const onWhy = (item: RecItemDTO, row: RecRowDTO, el: HTMLElement | null) => openWhy({ kind: "item", item, row }, el);
  const onWhyRow = (row: RecRowDTO, el: HTMLElement | null) => openWhy({ kind: "row", row }, el);

  const body = (r: HomeRecsDTO) => {
    if (r.reason === "cold_start") {
      return (
        <ColdStart
          onReady={() => {
            setJustCalibrated(true);
            actions.reload();
          }}
        />
      );
    }
    if (r.reason === "error") return null;
    const subline = r.reason === "no_index" ? "Based on your favourites" : builtFromLine(positiveCount);
    return rows.map((row) => {
      if (row.kind === "for_you") {
        const tuned = tokens.length > 0;
        const empty = tuned ? (
          <EmptyNote text="Nothing matches those filters yet." action="Reset" onAction={actions.resetTune} />
        ) : (
          <EmptyNote text="You've cleared this row." action="Surprise me" onAction={actions.surprise} />
        );
        const shown = showSkeleton ? { ...row, items: [] } : row;
        return (
          <RecRow
            key={row.id}
            row={shown}
            reason={r.reason}
            heading={<ForYouHeading subline={subline} />}
            headingAction={
              <CueEntryButton
                entry="home_for_you"
                variant="pill"
                label="Ask Cue"
                message="Help me pick something from my For-you row tonight"
              />
            }
            subheader={
              r.reason === "ok" ? (
                <TuneBar
                  chips={r.tuneChips}
                  available={r.tuneAvailable}
                  selected={tokens}
                  onToggle={actions.toggleToken}
                  onSurprise={actions.surprise}
                  onReset={actions.resetTune}
                />
              ) : null
            }
            dimmed={pending && !showSkeleton}
            empty={showSkeleton ? <CardSkeletons /> : empty}
            onWhy={onWhy}
            onWhyRow={onWhyRow}
            onDismiss={actions.dismiss}
          />
        );
      }
      const node = (
        <RecRow
          key={row.id}
          row={row}
          reason={r.reason}
          onWhy={onWhy}
          onWhyRow={onWhyRow}
          onDismiss={actions.dismiss}
          onRemoveSeed={actions.removeSeed}
        />
      );
      return row.kind === "seed" ? <GrowIn key={row.id}>{node}</GrowIn> : node;
    });
  };

  return (
    <>
      <Suspense fallback={null}>
        <TuneUrlSync tokens={tokens} onUrlTokens={actions.onUrlTokens} />
      </Suspense>
      {recs === null ? <RowSkeleton /> : body(recs)}
      {whyLoaded && (
        <RecWhySheet
          target={why?.target ?? null}
          anchorEl={why?.el ?? null}
          onClose={closeWhy}
          onMoreLikeThis={(it, row) => {
            closeWhy();
            actions.moreLikeThis(it, row);
          }}
          onDismiss={(it, row) => {
            closeWhy();
            actions.dismiss(it, row);
          }}
        />
      )}
      {recs?.reason === "ok" || recs?.reason === "no_index" ? <TasteTwinsStrip /> : null}
    </>
  );
}

function EmptyNote({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex min-h-40 flex-shrink-0 items-center gap-3 text-sm font-medium text-muted-foreground">
      <span>{text}</span>
      <Button variant="secondary" size="sm" className="min-h-10 md:min-h-8" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}
