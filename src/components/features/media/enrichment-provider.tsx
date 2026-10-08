"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { m, AnimatePresence } from "framer-motion";
import { HERO_TAGLINE } from "@/lib/design";
import {
  useEnrichmentStream,
  type EnrichmentStreamState,
} from "@/hooks/use-enrichment-stream";
import { RatingsBar } from "./ratings-bar";
import { AIQuestionsSection } from "./ai-questions-section";
import { DeepDiveSection } from "./deep-dive-section";
import type { ExternalRating } from "@/types";
import { pickRatings } from "./enrichment-ratings";

// =============================================================================
// Context
// =============================================================================

const EnrichmentContext = createContext<EnrichmentStreamState | null>(null);

/**
 * Hook to access live enrichment updates from SSE.
 * Returns null when not inside an EnrichmentProvider (safe to call anywhere).
 */
export function useEnrichment(): EnrichmentStreamState | null {
  return useContext(EnrichmentContext);
}

// =============================================================================
// Provider
// =============================================================================

interface EnrichmentProviderProps {
  mediaType: "movie" | "series";
  mediaId: number;
  children: ReactNode;
}

/**
 * Client component that connects to the SSE enrichment endpoint
 * and provides live updates to child components via context.
 *
 * Wraps detail page content. The useEnrichmentStream hook handles:
 * - Single connection via useRef gate
 * - Auto-close on unmount or `done` event
 * - No reconnection by design
 *
 * Child components use `useEnrichment()` to read latestRatings/latestAI.
 */
export function EnrichmentProvider({
  mediaType,
  mediaId,
  children,
}: EnrichmentProviderProps) {
  const streamState = useEnrichmentStream(mediaType, mediaId);

  return (
    <EnrichmentContext.Provider value={streamState}>
      {children}
    </EnrichmentContext.Provider>
  );
}

// =============================================================================
// Refresh Indicator
// =============================================================================

/**
 * Subtle refresh indicator — small pulsing dot with "Updating" text.
 * Only visible when isRefreshing is true from the enrichment stream.
 */
export function EnrichmentRefreshIndicator() {
  const enrichment = useEnrichment();

  if (!enrichment?.isRefreshing) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 animate-in fade-in duration-300">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/40" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand/60" />
      </span>
      <span>Updating</span>
    </div>
  );
}

// =============================================================================
// Live Ratings (replaces server-rendered ratings when SSE data arrives)
// =============================================================================

interface LiveRatingsProps {
  /** Server-rendered ratings from the RSC */
  initialRatings: ExternalRating[];
  size?: "sm" | "md" | "lg";
  maxVisible?: number;
  mediaType: "movie" | "series";
  tmdbId: number;
}

/**
 * Renders ratings with live SSE updates.
 * Uses server-rendered ratings initially, swaps to PG data from the stream
 * when it differs (new scrape mid-visit, or the HTML was a stale cached copy).
 */
export function LiveRatings({
  initialRatings,
  size = "md",
  maxVisible = 5,
  mediaType,
  tmdbId,
}: LiveRatingsProps) {
  const enrichment = useEnrichment();

  // The stream always opens with PG's current ratings, so a stale cached HTML
  // copy self-heals here; equal data keeps the server array (no swap).
  const ratings = pickRatings(
    initialRatings,
    enrichment?.latestRatings?.ratings,
    tmdbId,
    mediaType
  );

  if (ratings.length === 0) return null;

  return <RatingsBar ratings={ratings} size={size} maxVisible={maxVisible} />;
}

// =============================================================================
// Live AI Hook (fades in when SSE AI data arrives)
// =============================================================================

interface LiveAIHookProps {
  /** Server-rendered hook text (may be null if AI data didn't exist yet) */
  initialHook: string | null;
}

/**
 * Renders the AI hook tagline with live SSE updates.
 * If server had no hook but SSE delivers one, it fades in.
 */
export function LiveAIHook({ initialHook }: LiveAIHookProps) {
  const enrichment = useEnrichment();
  const requestAI = enrichment?.requestAI;

  // No hook in the HTML: it may be a stale cached copy from before AI
  // enrichment landed. Ask PG once (cheap snapshot, no polling).
  useEffect(() => {
    if (!initialHook) requestAI?.();
  }, [initialHook, requestAI]);

  const hook = enrichment?.latestAI?.hook ?? initialHook;

  return (
    <AnimatePresence>
      {hook && (
        <m.blockquote
          key="ai-hook"
          initial={initialHook ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={HERO_TAGLINE}
        >
          {hook}
        </m.blockquote>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Live AI Sections (renders AI content from SSE when not server-rendered)
// =============================================================================

interface LiveAISectionsProps {
  /** Title for AI questions context */
  title: string;
  year?: string;
  tmdbId: number;
}

/**
 * Renders AI sections (questions, deep dive) from SSE data
 * when they weren't available at server render time.
 *
 * Only include this component when `aiData === null` in the server render.
 * When SSE delivers AI data, this fades in the relevant sections.
 */
export function LiveAISections({
  title,
  year,
  tmdbId,
}: LiveAISectionsProps) {
  const enrichment = useEnrichment();
  const latestAI = enrichment?.latestAI;
  const requestAI = enrichment?.requestAI;

  // Mounted only when the HTML had no AI data, possibly a stale cached copy.
  useEffect(() => {
    requestAI?.();
  }, [requestAI]);

  if (!latestAI) return null;

  const questions = latestAI.insights?.spoilerFree?.questions;
  const deepDiveItems = latestAI.insights?.spoilerContent?.deepDive;

  const hasQuestions = questions && questions.length > 0;
  const hasDeepDive = deepDiveItems && deepDiveItems.length > 0;

  if (!hasQuestions && !hasDeepDive) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {hasQuestions && (
        <AIQuestionsSection
          questions={questions}
          title={title}
          year={year}
          tmdbId={tmdbId}
          className="mt-4"
        />
      )}
      {hasDeepDive && (
        <DeepDiveSection
          items={deepDiveItems}
          className="mt-6"
          maxCollapsedItems={3}
          mediaId={tmdbId}
        />
      )}
    </m.div>
  );
}
