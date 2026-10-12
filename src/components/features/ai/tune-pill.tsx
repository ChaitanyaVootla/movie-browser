"use client";

/**
 * Renders Cue's `[TUNE:…]` tag (taste v2 §5.2) as a pill and bridges it to the
 * home For-you row:
 * - on `/`: dispatches `RECS_TUNE_EVENT` once for a `live` reply (one that
 *   streamed while the chat view was mounted — never for restored history). A
 *   tap re-applies it. The For-you island re-validates every token.
 * - elsewhere: the pill links to `/?tune=…` and the home URL state applies it.
 * Loaded lazily by `TuneTagSlot` (tune-tag-slot.tsx) only when a reply carries a
 * tag, so the chat bundle (root layout, every route) stays flat.
 */
import { memo, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowRight, SlidersHorizontal } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";
import { RECS_TUNE_EVENT, type RecsTuneDetail } from "./types";
import { extractTuneTag, tuneHref } from "./tune-tag";

/** Message contents already applied this page lifetime (the minimal and expanded views both render a reply). */
const applied = new Set<string>();

function dispatchTune(tokens: string[]) {
  const detail: RecsTuneDetail = { tokens };
  window.dispatchEvent(new CustomEvent(RECS_TUNE_EVENT, { detail }));
}

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-medium px-3 min-h-10 md:min-h-8 hover:bg-brand/15 transition-colors";

export const TunePill = memo(function TunePill({
  content,
  live = false,
  className,
}: {
  /** The raw assistant message (tag included). */
  content: string;
  /** The reply streamed while the chat view was mounted (auto-apply allowed). */
  live?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const { trackAction } = useAnalytics();
  const match = useMemo(() => extractTuneTag(content), [content]);
  const tokensKey = match?.tokens.join(",") ?? "";
  useEffect(() => {
    if (!tokensKey || !onHome || !live || applied.has(content)) return;
    applied.add(content);
    const tokens = tokensKey.split(",");
    trackAction({ action: "cue_tune_applied", metadata: { tokens, via: "auto" } });
    dispatchTune(tokens);
  }, [tokensKey, onHome, live, content, trackAction]);

  if (!match) return null;
  const { tokens } = match;

  if (!onHome) {
    return (
      <Link
        href={tuneHref(tokens)}
        prefetch={false}
        className={cn(PILL, className)}
        data-testid="ai-tune-pill"
        onClick={() => trackAction({ action: "cue_tune_applied", metadata: { tokens, via: "link" } })}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        Apply to your For-you row
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cn(PILL, className)}
      data-testid="ai-tune-pill"
      onClick={() => {
        trackAction({ action: "cue_tune_applied", metadata: { tokens, via: "tap" } });
        dispatchTune(tokens);
      }}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      Applied to your For-you row
      <ArrowDown className="size-3.5" aria-hidden />
    </button>
  );
});
