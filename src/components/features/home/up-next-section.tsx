"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListVideo } from "lucide-react";
import { useSafeSession } from "@/hooks/use-safe-session";
import { useAnalytics } from "@/hooks/use-analytics";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { CardPendingOverlay } from "@/components/features/layout/nav-pending";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getUpNext } from "@/server/actions/tracking";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import { getMediaPath } from "@/lib/utils";
import { episodeCode } from "@/lib/tracking-format";
import { CDN_IMAGE_BASE, TMDB_IMAGE_BASE } from "@/lib/constants";
import type { UpNextItemDTO } from "@/types/social";

/**
 * "Up Next" — next unwatched episode for WATCHING/REWATCHING shows.
 * Client island: the home page is ISR-cached, so this fetches per-user on the
 * client (roadmap invariant §4.1.8) like ContinueWatchingSection.
 */
export function UpNextSection({ title = "Up Next" }: { title?: string } = {}) {
  const { status } = useSafeSession();
  const { trackAction } = useAnalytics();
  const [items, setItems] = useState<UpNextItemDTO[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getUpNext(12)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((error: unknown) => {
        if (isStaleServerActionError(error)) {
          recoverFromStaleAction();
          return;
        }
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== "authenticated") return null;

  if (items === null) {
    return (
      <section className="space-y-4">
        <SectionHeading icon={<ListVideo className="h-5 w-5 text-brand" />}>{title}</SectionHeading>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[240px] md:w-[280px] space-y-2">
              <Skeleton className="aspect-video rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <MediaScroller
      title={<SectionHeading icon={<ListVideo className="h-5 w-5 text-brand" />}>{title}</SectionHeading>}
      showControls={items.length > 4}
    >
      {items.map((item) => {
        const still = item.episodeStillPath
          ? `${TMDB_IMAGE_BASE}/w400${item.episodeStillPath}`
          : `${CDN_IMAGE_BASE}/series/${item.seriesId}/backdrop.webp`;
        return (
          <Link
            key={`${item.seriesId}-${item.seasonNumber}-${item.episodeNumber}`}
            href={getMediaPath("series", item.seriesId, item.seriesName)}
            prefetch={false}
            className="group flex-shrink-0 w-[240px] md:w-[280px]"
            onClick={() =>
              trackAction({
                action: "up_next_click",
                mediaType: "series",
                itemId: item.seriesId,
                itemTitle: item.seriesName,
                metadata: { seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber },
              })
            }
          >
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={still}
                alt={`${item.seriesName} ${episodeCode(item.seasonNumber, item.episodeNumber)}`}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <Badge
                variant="secondary"
                className="absolute top-2 left-2 bg-black/70 text-white border-0 text-xs"
              >
                {episodeCode(item.seasonNumber, item.episodeNumber)}
              </Badge>
              {item.episodesLeft > 1 && (
                <Badge
                  variant="secondary"
                  className="absolute bottom-2 right-2 bg-black/70 text-white border-0 text-[10px]"
                >
                  {item.episodesLeft} left
                </Badge>
              )}
              <CardPendingOverlay />
            </div>
            <h3 className="text-sm font-medium line-clamp-1 group-hover:text-brand transition-colors">
              {item.seriesName}
            </h3>
            {item.episodeName && (
              <p className="text-xs font-medium text-muted-foreground line-clamp-1">
                {item.episodeName}
              </p>
            )}
          </Link>
        );
      })}
    </MediaScroller>
  );
}
