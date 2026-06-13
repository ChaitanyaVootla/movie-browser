import Image from "next/image";
import Link from "next/link";
import { ListChecks, MessageSquareQuote, Star, Tv } from "lucide-react";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { ReviewCard } from "@/components/features/reviews/review-card";
import { BreakdownBars, Histogram } from "@/components/features/stats/bar-charts";
import { RewatchChampions } from "@/components/features/stats/rewatch-champions";
import { episodeCode } from "@/lib/tracking-format";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { PublicProfileDTO } from "@/types/social";

export function PinnedLists({ lists, username }: { lists: PublicProfileDTO["pinnedLists"]; username: string }) {
  if (lists.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeading icon={<ListChecks className="h-5 w-5 text-brand" />}>Lists</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2">
        {lists.map((list) => (
          <Link
            key={list.id}
            href={`/u/${username}/list/${list.slug}`}
            prefetch={false}
            className="group flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <div className="flex -space-x-4">
              {list.posterPaths.slice(0, 3).map((path, i) => (
                <div
                  key={i}
                  className="relative h-16 w-11 overflow-hidden rounded border border-border bg-muted"
                  style={{ zIndex: 3 - i }}
                >
                  <Image src={`${TMDB_IMAGE_BASE}/w92${path}`} alt="" fill className="object-cover" sizes="44px" />
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
                {list.name}
              </p>
              <p className="text-xs font-medium text-muted-foreground">{list.itemCount} titles</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CurrentlyWatchingShelf({ items }: { items: PublicProfileDTO["currentlyWatching"] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeading icon={<Tv className="h-5 w-5 text-brand" />}>Currently watching</SectionHeading>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item) => (
          <Link
            key={item.seriesId}
            href={getMediaPath("series", item.seriesId, item.seriesName)}
            prefetch={false}
            className="group w-24 flex-shrink-0"
          >
            <div className="relative mb-1.5 aspect-[2/3] overflow-hidden rounded-lg bg-muted">
              {item.posterPath && (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${item.posterPath}`}
                  alt={item.seriesName}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="96px"
                />
              )}
              {item.seasonNumber !== null && item.episodeNumber !== null && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {episodeCode(item.seasonNumber, item.episodeNumber)}
                </span>
              )}
            </div>
            <p className="text-xs font-medium line-clamp-2 group-hover:text-brand transition-colors">
              {item.seriesName}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ProfileTaste({ profile }: { profile: PublicProfileDTO }) {
  const hasHistogram = profile.ratingsHistogram.some((n) => n > 0);
  if (!hasHistogram && profile.topGenres.length === 0 && profile.topDecades.length === 0) {
    return null;
  }
  return (
    <section className="space-y-4">
      <SectionHeading icon={<Star className="h-5 w-5 text-brand" />}>Taste</SectionHeading>
      <div className="grid gap-6 md:grid-cols-3">
        {hasHistogram && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Ratings
            </p>
            <Histogram counts={profile.ratingsHistogram} />
          </div>
        )}
        {profile.topGenres.length > 0 && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Genres
            </p>
            <BreakdownBars data={profile.topGenres.slice(0, 6)} />
          </div>
        )}
        {profile.topDecades.length > 0 && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Decades
            </p>
            <BreakdownBars data={profile.topDecades.slice(0, 6)} />
          </div>
        )}
      </div>
      {profile.rewatchChampions.length > 0 && (
        <div className="pt-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Rewatch champions
          </p>
          <RewatchChampions champions={profile.rewatchChampions} />
        </div>
      )}
    </section>
  );
}

export function ProfileReviews({ reviews }: { reviews: PublicProfileDTO["reviews"] }) {
  if (reviews.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeading icon={<MessageSquareQuote className="h-5 w-5 text-brand" />}>
        Reviews
      </SectionHeading>
      <div className="grid gap-4 md:grid-cols-2">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </section>
  );
}
