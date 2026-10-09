"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, Star } from "lucide-react";
import { useSafeSession } from "@/hooks/use-safe-session";
import { useAnalytics } from "@/hooks/use-analytics";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { MediaCard, MediaCardSkeleton } from "@/components/features/movie/media-card";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getHomeRecs } from "@/server/actions/taste-recs";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { MovieListItem, SeriesListItem } from "@/types";
import type { RecItemDTO, RecReason, RecRowDTO, RecsDTO } from "@/lib/taste/recommend-types";
import { TasteTwinsStrip } from "./taste-twins-strip";

const POSTER_CARD = "w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0";
const WIDE_CARD = "w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0";

/** RecItemDTO → the list-item shape MediaCard already renders. */
export function toListItem(it: RecItemDTO): MovieListItem | SeriesListItem {
  const common = {
    id: it.id,
    poster_path: it.posterPath,
    backdrop_path: it.backdropPath,
    vote_average: it.voteAverage ?? 0,
    vote_count: it.voteCount ?? 0,
    popularity: it.popularity ?? 0,
    adult: false,
  };
  return it.mediaType === "movie"
    ? { ...common, title: it.title, release_date: it.releaseDate ?? "", media_type: "movie" }
    : { ...common, name: it.title, first_air_date: it.releaseDate ?? "", media_type: "tv" };
}

/** Card subtitle for an explanation ("Like Inception" / "Korean thrillers") — short, because MovieCard clamps it to one line at 150px. */
export function explanationText(it: RecItemDTO, row: RecRowDTO): string | undefined {
  const e = it.explanation;
  if (!e) return undefined;
  if (e.kind === "facet") return e.label;
  // In a "Because you loved X" row the heading already names X.
  if (row.anchor && e.anchor.id === row.anchor.id && e.anchor.mediaType === row.anchor.mediaType) {
    return undefined;
  }
  return `Like ${e.anchor.title}`;
}

function RowHeading({ row, reason }: { row: RecRowDTO; reason: RecReason }) {
  if (row.kind === "because" && row.anchor) {
    const poster = row.anchor.posterPath ? `${TMDB_IMAGE_BASE}/w92${row.anchor.posterPath}` : null;
    return (
      <SectionHeading
        icon={
          poster ? (
            <span className="relative block h-8 w-[22px] flex-shrink-0 overflow-hidden rounded-md bg-muted">
              <Image src={poster} alt="" fill sizes="22px" className="object-cover" unoptimized />
            </span>
          ) : (
            <Star className="h-5 w-5 text-brand" />
          )
        }
      >
        <span className="line-clamp-1">Because you loved {row.anchor.title}</span>
      </SectionHeading>
    );
  }
  return (
    <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>
      {reason === "cold_start" ? "Popular in your genres" : "For you"}
    </SectionHeading>
  );
}

function RecRow({ row, reason }: { row: RecRowDTO; reason: RecReason }) {
  const { trackAction } = useAnalytics();
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || row.items.length === 0) return;
    tracked.current = true;
    trackAction({
      action: "rec_impression",
      metadata: {
        row: row.id,
        source: row.items[0]?.source,
        reason,
        count: row.items.length,
        ids: row.items.map((i) => `${i.mediaType === "movie" ? "m" : "s"}:${i.id}`),
      },
    });
  }, [row, reason, trackAction]);

  return (
    <section className="space-y-2">
      <MediaScroller title={<RowHeading row={row} reason={reason} />} contentPadding="" showControls={row.items.length > 4}>
        {row.items.map((it, position) => (
          <div
            key={`${it.mediaType}-${it.id}`}
            className="flex-shrink-0"
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
            <MediaCard
              item={toListItem(it)}
              className={POSTER_CARD}
              wideClassName={WIDE_CARD}
              subtitle={explanationText(it, row)}
            />
          </div>
        ))}
      </MediaScroller>
      {reason === "cold_start" && row.kind === "for_you" && (
        <p className="text-xs font-medium text-muted-foreground">
          Rate or heart a few titles and this row starts following your taste.{" "}
          <Link href="/diary" prefetch={false} className="text-foreground underline-offset-4 hover:underline">
            Open your diary
          </Link>
        </p>
      )}
    </section>
  );
}

function RowSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading recommendations">
      <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>For you</SectionHeading>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <MediaCardSkeleton key={i} className={POSTER_CARD} wideClassName={WIDE_CARD} />
        ))}
      </div>
    </section>
  );
}

/**
 * "For you" + up to two "Because you loved …" rows + taste twins. Client
 * island: the home page is ISR-cached, so recs load per-viewer via a POST
 * server action after hydration (never in cacheable HTML). Guests see nothing.
 */
export function ForYouSection() {
  const { status } = useSafeSession();
  const [recs, setRecs] = useState<RecsDTO | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getHomeRecs()
      .then((data) => {
        if (!cancelled) setRecs(data);
      })
      .catch((error: unknown) => {
        if (isStaleServerActionError(error)) {
          recoverFromStaleAction();
          return;
        }
        if (!cancelled) setRecs({ rows: [], reason: "error", algo: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== "authenticated") return null;
  if (recs === null) return <RowSkeleton />;

  const rows = recs.rows.filter((r) => r.items.length > 0);
  return (
    <>
      {rows.map((row) => (
        <RecRow key={row.id} row={row} reason={recs.reason} />
      ))}
      <TasteTwinsStrip />
    </>
  );
}
