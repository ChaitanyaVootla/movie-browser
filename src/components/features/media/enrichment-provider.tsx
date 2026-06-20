"use client";

import { createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HERO_TAGLINE } from "@/lib/design";
import {
  useEnrichmentStream,
  type EnrichmentStreamState,
} from "@/hooks/use-enrichment-stream";
import { RatingsBar } from "./ratings-bar";
import { QuickTake } from "./quick-take";
import { AIQuestionsSection } from "./ai-questions-section";
import { DeepDiveSection } from "./deep-dive-section";
import type { ExternalRating } from "@/types";

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
 * Normalize sentiment from SSE data to the POSITIVE/NEGATIVE format
 * used by the ExternalRating type. Follows integration.ts normalizeSentiment.
 */
function normalizeSentiment(
  sentiment: string | null
): "POSITIVE" | "NEGATIVE" | undefined {
  if (!sentiment) return undefined;
  const s = sentiment.toLowerCase();
  if (s.includes("fresh") || s.includes("upright") || s.includes("positive"))
    return "POSITIVE";
  if (s.includes("rotten") || s.includes("spilled") || s.includes("negative"))
    return "NEGATIVE";
  return undefined;
}

/**
 * Convert SSE ratings data to ExternalRating[] format.
 * Follows the same whitelist/normalization as buildRatingsArray in integration.ts.
 */
function convertSSERatingsToExternalRatings(
  sseRatings: NonNullable<EnrichmentStreamState["latestRatings"]>["ratings"],
  tmdbId: number,
  mediaType: "movie" | "series"
): ExternalRating[] {
  const ratings: ExternalRating[] = [];
  const tmdbPath = mediaType === "movie" ? "movie" : "tv";

  for (const r of sseRatings) {
    const slug = r.source.slug.toLowerCase();

    if (slug === "tmdb") {
      // Normalize 0-10 to 0-100
      ratings.push({
        name: "TMDB",
        rating: Math.round(r.score * 10).toString(),
        link: `https://www.themoviedb.org/${tmdbPath}/${tmdbId}`,
      });
    } else if (slug === "imdb") {
      ratings.push({
        name: "IMDb",
        rating: Math.round(r.score * 10).toString(),
        link: r.sourceUrl || "https://www.imdb.com",
      });
    } else if (slug === "rt_critic" || slug === "rottentomatoes_critic") {
      ratings.push({
        name: "Rotten Tomatoes",
        rating: Math.round(r.score).toString(),
        link: r.sourceUrl || "https://www.rottentomatoes.com",
        certified: r.certified ?? undefined,
        sentiment: normalizeSentiment(r.sentiment),
      });
    } else if (slug === "rt_audience" || slug === "rottentomatoes_audience") {
      ratings.push({
        name: "Audience Score",
        rating: Math.round(r.score).toString(),
        link: r.sourceUrl || "https://www.rottentomatoes.com",
        certified: r.certified ?? undefined,
        sentiment: normalizeSentiment(r.sentiment),
      });
    } else if (slug === "google") {
      ratings.push({
        name: "Google",
        rating: Math.round(r.score).toString(),
        link: "https://www.google.com",
      });
    }
    // Skip metacritic and letterboxd — same as integration.ts
  }

  return ratings;
}

/**
 * Renders ratings with live SSE updates.
 * Uses server-rendered ratings initially, swaps to SSE data when it arrives.
 */
export function LiveRatings({
  initialRatings,
  size = "md",
  maxVisible = 5,
  mediaType,
  tmdbId,
}: LiveRatingsProps) {
  const enrichment = useEnrichment();

  const ratings = enrichment?.latestRatings?.ratings?.length
    ? convertSSERatingsToExternalRatings(
        enrichment.latestRatings.ratings,
        tmdbId,
        mediaType
      )
    : initialRatings;

  if (ratings.length === 0) return null;

  return <RatingsBar ratings={ratings} size={size} maxVisible={maxVisible} />;
}

// =============================================================================
// Live AI Hook (fades in when SSE AI data arrives)
// =============================================================================

interface LiveAIHookProps {
  /** Server-rendered hook text (may be null if AI data didn't exist yet) */
  initialHook: string | null;
  /** Server-rendered quick-take tags (VIBE insights), shown subtly under the hook. */
  initialTags?: string[];
}

/**
 * Renders the AI hook tagline + the quick-take tags under it, with live SSE
 * updates. If the server had no AI data but SSE delivers it, both fade in.
 */
export function LiveAIHook({ initialHook, initialTags }: LiveAIHookProps) {
  const enrichment = useEnrichment();

  const hook = enrichment?.latestAI?.hook ?? initialHook;
  const tags = enrichment?.latestAI?.insights?.spoilerFree?.vibes ?? initialTags ?? [];

  return (
    <AnimatePresence>
      {hook && (
        <motion.div
          key="ai-hook"
          initial={initialHook ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex max-w-xl flex-col items-center gap-1.5 md:items-start"
        >
          <blockquote className={HERO_TAGLINE}>{hook}</blockquote>
          {tags.length > 0 && (
            <QuickTake items={tags} variant="hero" maxVisible={4} className="justify-center md:justify-start" />
          )}
        </motion.div>
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

  if (!latestAI) return null;

  const questions = latestAI.insights?.spoilerFree?.questions;
  const deepDiveItems = latestAI.insights?.spoilerContent?.deepDive;

  const hasQuestions = questions && questions.length > 0;
  const hasDeepDive = deepDiveItems && deepDiveItems.length > 0;

  if (!hasQuestions && !hasDeepDive) return null;

  return (
    <motion.div
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
    </motion.div>
  );
}
