"use client";

/**
 * Cold-start calibration deck (taste v2 spec 2026-10-12 §3.6): rate ~10 known
 * titles; picks appear once 3 positives land. Also hosted by the profile owner
 * hint (workstream B) — import it via `next/dynamic`, it is never above the fold.
 *
 * Buttons are the primary, accessible path; swipe (pointer, 60px) is an
 * enhancement. Keyboard (focus inside the deck): ← Not for me, → Liked it,
 * ↑ Loved it, ↓ Haven't seen it. Every answer is written immediately (so
 * progress survives a reload) and announced via aria-live.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";
import { getCalibrationDeck, submitCalibration } from "@/server/actions/taste-calibration";
import { CALIBRATION_TARGET_ANSWERS } from "@/lib/taste/calibration";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CalibrationAnswer, CalibrationItemDTO, CalibrationMode } from "@/lib/taste/recommend-types";

export interface TasteCalibrationDeckProps {
  /** "start" = cold start; "sharpen" = warm user, mid-relevance candidates. */
  mode: CalibrationMode;
  onProgress?: (p: { answered: number; positives: number }) => void;
  /** `ready` = enough positives for the For-you row. */
  onComplete?: (r: { positives: number; ready: boolean }) => void;
  className?: string;
}

const SWIPE_PX = 60;
const ANSWER_BTN = "h-auto min-h-14 flex-col gap-1 px-2 text-xs sm:min-h-10 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm";
const EXIT_MS = 200;
const ANSWER_COPY: Record<CalibrationAnswer, string> = {
  disliked: "Not for me",
  liked: "Liked it",
  loved: "Loved it",
  skip: "Haven't seen it",
};

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function exitFrames(answer: CalibrationAnswer): Keyframe[] {
  const to =
    answer === "disliked" ? "translateX(-40px)" : answer === "skip" ? "translateY(24px)" : "translateX(40px)";
  return [
    { transform: "none", opacity: 1 },
    { transform: to, opacity: 0 },
  ];
}

export function TasteCalibrationDeck({ mode, onProgress, onComplete, className }: TasteCalibrationDeckProps) {
  const { trackAction } = useAnalytics();
  const [items, setItems] = useState<CalibrationItemDTO[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [positives, setPositives] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);

  const fetchDeck = useCallback(() => {
    getCalibrationDeck({ mode })
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [mode]);

  useEffect(() => fetchDeck(), [fetchDeck]);

  const loadDeck = () => {
    setItems(null);
    setIndex(0);
    fetchDeck();
  };

  const current = items && index < items.length ? items[index] : null;

  // Next card scales in (WAAPI; opacity only with reduced motion).
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !current || typeof el.animate !== "function") return;
    el.animate(
      reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "scale(0.96)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 180, easing: "ease-out" }
    );
  }, [current]);

  const answer = useCallback(
    (a: CalibrationAnswer) => {
      if (!current || busy || done) return;
      // The answer buttons disable while the write lands, and a disabled button
      // drops focus to <body> — the arrow keys would stop working after one
      // click. Keep focus in the deck instead.
      const root = rootRef.current;
      const keepFocus = root !== null && root.contains(document.activeElement);
      setBusy(true);
      const position = answered + 1;
      trackAction({
        action: "taste_calibration_answer",
        mediaType: current.mediaType,
        itemId: current.id,
        itemTitle: current.title,
        metadata: { answer: a, position, mode },
      });
      setAnnounce(`${ANSWER_COPY[a]}: ${current.title}. ${Math.min(position, CALIBRATION_TARGET_ANSWERS)} of ${CALIBRATION_TARGET_ANSWERS}.`);
      const write = submitCalibration({ answers: [{ mediaType: current.mediaType, id: current.id, answer: a }] }).catch(
        () => ({ positives, ready: false })
      );
      const advance = () => {
        void write.then((res) => {
          const nextPositives = Math.max(positives, res.positives);
          setPositives(nextPositives);
          setAnswered(position);
          onProgress?.({ answered: position, positives: nextPositives });
          const finished = res.ready || position >= CALIBRATION_TARGET_ANSWERS;
          if (finished) {
            setDone(true);
            setReady(res.ready);
            trackAction({ action: "taste_calibration_complete", metadata: { positives: nextPositives, mode } });
            onComplete?.({ positives: nextPositives, ready: res.ready });
          } else {
            setIndex((i) => i + 1);
          }
          setBusy(false);
          if (keepFocus) root?.focus({ preventScroll: true });
        });
      };
      const el = cardRef.current;
      if (el && typeof el.animate === "function" && !reducedMotion()) {
        const anim = el.animate(exitFrames(a), { duration: EXIT_MS, easing: "ease-out", fill: "forwards" });
        anim.onfinish = advance;
      } else {
        advance();
      }
    },
    [current, busy, done, answered, positives, mode, onProgress, onComplete, trackAction]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, CalibrationAnswer> = {
      ArrowLeft: "disliked",
      ArrowRight: "liked",
      ArrowUp: "loved",
      ArrowDown: "skip",
    };
    const a = map[e.key];
    if (!a) return;
    e.preventDefault();
    answer(a);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, dx: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !cardRef.current) return;
    drag.current.dx = e.clientX - drag.current.x;
    if (!reducedMotion()) cardRef.current.style.transform = `translateX(${drag.current.dx * 0.5}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (cardRef.current) cardRef.current.style.transform = "";
    if (!d) return;
    if (d.dx >= SWIPE_PX) answer("liked");
    else if (d.dx <= -SWIPE_PX) answer("disliked");
  };

  const shown = Math.min(answered, CALIBRATION_TARGET_ANSWERS);
  const exhausted = items !== null && !current && !done;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn("rounded-xl border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6", className)}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Rate titles to start your taste profile"
    >
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {items === null ? (
        <div className="flex gap-4" aria-busy="true">
          <div className="aspect-[2/3] w-[60vw] max-w-[240px] animate-pulse rounded-lg bg-muted" />
        </div>
      ) : done ? (
        <p className="text-sm font-medium">
          {ready ? "Your picks are ready." : "Saved. Rate a few more any time to sharpen your picks."}
        </p>
      ) : exhausted || items.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Nothing here you have seen yet?</p>
          <Button variant="secondary" className="min-h-10" onClick={loadDeck}>
            Try 10 more
          </Button>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div
            ref={cardRef}
            className="relative aspect-[2/3] w-[60vw] max-w-[240px] flex-shrink-0 touch-pan-y select-none self-center overflow-hidden rounded-lg bg-muted ring-1 ring-border sm:self-start"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {current.posterPath && (
              <Image
                src={`${TMDB_IMAGE_BASE}/w342${current.posterPath}`}
                alt={current.title}
                fill
                sizes="240px"
                className="pointer-events-none object-cover"
                unoptimized
                draggable={false}
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: CALIBRATION_TARGET_ANSWERS }).map((_, i) => (
                  <span key={i} className={cn("size-2 rounded-full", i < shown ? "bg-brand" : "bg-foreground/15")} />
                ))}
              </div>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {shown} of {CALIBRATION_TARGET_ANSWERS}
              </span>
            </div>
            <div>
              <p className="line-clamp-2 text-lg font-semibold">
                {current.title}
                {current.year ? <span className="font-normal text-muted-foreground"> ({current.year})</span> : null}
              </p>
              {current.genres.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground">{current.genres.join(", ")}</p>
              )}
            </div>
            {/* Mobile: three equal columns, icon over label — a row of three
                labelled buttons does not fit 390px and "Loved it" wrapped alone. */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <Button variant="secondary" className={ANSWER_BTN} disabled={busy} onClick={() => answer("disliked")}>
                <ThumbsDown className="size-4" aria-hidden /> Not for me
              </Button>
              <Button variant="secondary" className={ANSWER_BTN} disabled={busy} onClick={() => answer("liked")}>
                <ThumbsUp className="size-4" aria-hidden /> Liked it
              </Button>
              <Button className={ANSWER_BTN} disabled={busy} onClick={() => answer("loved")}>
                <Heart className="size-4" aria-hidden /> Loved it
              </Button>
            </div>
            <Button variant="link" className="min-h-10 px-0 text-muted-foreground" disabled={busy} onClick={() => answer("skip")}>
              Haven&apos;t seen it
            </Button>
            <p className="hidden text-xs text-muted-foreground md:block">Keys: ← not for me · → liked · ↑ loved · ↓ not seen</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TasteCalibrationDeck;
