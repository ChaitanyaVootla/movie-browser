"use client";

import { useMemo, useState, type ReactNode, type Ref } from "react";
import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getMediaHref } from "@/lib/utils";
import { getBackdropSources } from "@/lib/image";
import { getHoverCardBadges } from "@/lib/badges";
import { useUserStore, selectSeriesProgress } from "@/stores/user";
// Direct file imports — NOT the `@/components/features/media` barrel, which
// re-exports server components (SimilarSection…) and admin tools into every
// route via the root Providers (performance.md item 15).
import { MediaBadges } from "@/components/features/media/media-badges";
import { CardProgressBar } from "@/components/features/media/social-signals";
import { TitleActions } from "@/components/features/media/title-actions/title-actions";
import { InlinePendingSpinner } from "@/components/features/layout/nav-pending";
import type { PreviewItem } from "./preview-store";
import type { PreviewDataState } from "./use-preview-data";
import {
  ArtPendingOverlay,
  PreviewCast,
  PreviewDetailsSkeleton,
  PreviewMeta,
  PreviewProviders,
  PreviewRatings,
  type PreviewVariant,
} from "./preview-parts";

interface PreviewBodyProps {
  item: PreviewItem;
  state: PreviewDataState;
  onRetry: () => void;
  variant: PreviewVariant;
  /** id for the title heading (the dialog's aria-labelledby). */
  titleId: string;
  /** Pending navigation from the art link (keeps the hover preview open). */
  onNavPendingChange?: (pending: boolean) => void;
  /** The art region (the grow-out morph's target). */
  artRef?: Ref<HTMLDivElement>;
  /** Rendered inside the art region, above the backdrop (the morph's ghost layer). */
  artOverlay?: ReactNode;
  /** Stagger the body in (off for reduced motion). */
  stagger?: boolean;
  /**
   * Underline the title on art hover. The hover preview opens under the resting
   * cursor, so it passes `false` until the pointer actually moves (otherwise
   * every preview opened underlined). Keyboard focus always underlines.
   */
  hoverAffordance?: boolean;
}

const ROW_HIDDEN = { opacity: 0, y: 4 };
/** Rows arriving after open: fade only (the panel's clip is already growing). */
const ROW_LATE_HIDDEN = { opacity: 0, y: 0 };
const ROW_SHOWN = { opacity: 1, y: 0 };
const ROW_TRANSITION = { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const };
const STAGGER_BASE_S = 0.08;
const STAGGER_STEP_S = 0.04;

/**
 * The title preview content, ONE component for the desktop hover preview and
 * the mobile quick-info drawer (spec 2026-10-09 D2/D4):
 *
 *   art (backdrop, title, vote, badges, series progress) — the only <Link>
 *   meta · overview · TitleActions · ratings · where to watch · cast
 *
 * The art, title and actions render straight from the list item, so they are
 * usable while details load and when they fail. A failed fetch shows a short
 * message with Retry and View details, never an endless skeleton. No
 * interactive element is nested inside the art link (valid DOM).
 */
export function PreviewBody({
  item,
  state,
  onRetry,
  variant,
  titleId,
  onNavPendingChange,
  artRef,
  artOverlay,
  stagger = true,
  hoverAffordance = true,
}: PreviewBodyProps) {
  const isMovie = "title" in item;
  const mediaType = isMovie ? "movie" : "series";
  const data = state.status === "ready" ? state.data : null;
  const title = data?.title ?? (isMovie ? item.title : item.name);
  const href = getMediaHref(item.id, isMovie, title);

  const sources = getBackdropSources(
    {
      id: item.id,
      backdrop_path: data?.backdrop_path ?? item.backdrop_path,
      title: isMovie ? title : undefined,
      name: isMovie ? undefined : title,
    },
    mediaType
  );
  const [artFailed, setArtFailed] = useState(0);
  const artSrc = artFailed === 0 ? sources.primary : artFailed === 1 ? sources.fallback : null;

  const badges = useMemo(
    () => (data ? getHoverCardBadges(data, isMovie, { maxBadges: 2 }) : []),
    [data, isMovie]
  );

  const progress = useUserStore(selectSeriesProgress(item.id));
  const inProgress =
    !isMovie &&
    !!progress &&
    progress.pct > 0 &&
    !(progress.total != null && progress.watched >= progress.total);

  const rows: { key: string; node: ReactNode }[] = [];
  if (data) {
    rows.push({ key: "meta", node: <PreviewMeta data={data} /> });
    if (data.overview) {
      rows.push({
        key: "overview",
        node: (
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              variant === "drawer" ? "line-clamp-4" : "line-clamp-3"
            )}
          >
            {data.overview}
          </p>
        ),
      });
    }
  } else if (state.status === "error") {
    rows.push({
      key: "error",
      node: (
        <div className="space-y-2" role="status">
          <p className="text-sm text-muted-foreground">
            Couldn&rsquo;t load the details for this title.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={href} prefetch={false}>
                View details
                <InlinePendingSpinner />
              </Link>
            </Button>
          </div>
        </div>
      ),
    });
  } else {
    // Loading: placeholders for meta + overview ONLY, sized to match them, so
    // the actions don't move when details land. Nothing is reserved below the
    // actions: ratings / where-to-watch / cast are optional, and an empty
    // reserved block there read as a broken panel. The panel grows to fit them.
    rows.push({ key: "skeleton", node: <PreviewDetailsSkeleton variant={variant} /> });
  }
  rows.push({
    key: "actions",
    node: (
      <TitleActions
        variant="compact"
        itemId={item.id}
        mediaType={mediaType}
        title={title}
        posterPath={item.poster_path}
        href={href}
      />
    ),
  });
  if (data) {
    if (data.ratings.length > 0)
      rows.push({ key: "ratings", node: <PreviewRatings ratings={data.ratings} /> });
    if (data.watch_options.options.length > 0)
      rows.push({
        key: "providers",
        node: <PreviewProviders data={data} mediaType={mediaType} variant={variant} />,
      });
    if (data.cast.length > 0) rows.push({ key: "cast", node: <PreviewCast cast={data.cast} /> });
  }

  // Rows present at open get the entrance stagger. Rows that mount LATER
  // (details arriving) fade in at once: a 200-300ms stagger delay on them left
  // them invisible while the panel had already grown, i.e. an empty block.
  const [openingKeys] = useState(() => new Set(rows.map((r) => r.key)));

  return (
    <div className="flex flex-col" data-preview-state={state.status}>
      {/* Art — the only link. prefetch off (the preview itself was a fetch);
          the art dims with a spinner until the route actually changes. */}
      <Link
        href={href}
        prefetch={false}
        draggable={false}
        className="group/art relative block focus-visible:outline-none"
        aria-describedby={titleId}
      >
        <div ref={artRef} className="relative aspect-video w-full overflow-hidden bg-muted">
          {artSrc ? (
            <Image
              src={artSrc}
              alt=""
              fill
              sizes={variant === "drawer" ? "100vw" : "400px"}
              className="object-cover"
              draggable={false}
              onError={() => setArtFailed((n) => n + 1)}
              unoptimized
            />
          ) : null}
          {artOverlay}
          <span
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
            aria-hidden
          />
          {/* Drawer: the chips share a row with the drawer's 40px close button
              (top-right, mobile-quick-info-drawer.tsx), so they drop to its
              centre line and the vote chip sits to its left instead of under it. */}
          {badges.length > 0 && (
            <MediaBadges
              badges={badges}
              showIcons
              className={cn(
                "absolute left-3",
                variant === "drawer"
                  ? "top-4 max-w-[calc(100%-8rem)]"
                  : "top-3 max-w-[calc(100%-4.5rem)]"
              )}
            />
          )}
          {item.vote_average > 0 && (
            <span
              className={cn(
                "absolute rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-white",
                variant === "drawer" ? "right-[3.75rem] top-4" : "right-3 top-3"
              )}
            >
              {item.vote_average.toFixed(1)}
            </span>
          )}
          <h3
            id={titleId}
            className={cn(
              "absolute inset-x-3 bottom-3 line-clamp-2 font-semibold text-white drop-shadow-md group-focus-visible/art:underline",
              hoverAffordance && "group-hover/art:underline",
              variant === "drawer" ? "text-xl" : "text-lg"
            )}
          >
            {title}
          </h3>
          {inProgress && progress && <CardProgressBar percent={progress.pct} />}
          <span
            className="pointer-events-none absolute inset-0 ring-inset ring-ring group-focus-visible/art:ring-2"
            aria-hidden
          />
          <ArtPendingOverlay onPendingChange={onNavPendingChange} />
        </div>
      </Link>

      {/* Each row owns its initial/animate. Variant propagation does not replay
          for children that mount AFTER the parent animated (details arriving
          late), and those rows stayed stuck at opacity 0. */}
      <div className={cn("flex flex-col gap-3", variant === "drawer" ? "p-4" : "p-3.5")}>
        {rows.map((row, i) => {
          const late = !openingKeys.has(row.key);
          return (
            <m.div
              key={row.key}
              initial={stagger ? (late ? ROW_LATE_HIDDEN : ROW_HIDDEN) : false}
              animate={ROW_SHOWN}
              transition={{
                ...ROW_TRANSITION,
                delay: late ? 0 : STAGGER_BASE_S + i * STAGGER_STEP_S,
              }}
            >
              {row.node}
            </m.div>
          );
        })}
      </div>
    </div>
  );
}
