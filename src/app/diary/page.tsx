import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { EyeOff, NotebookPen, Repeat, Star, StickyNote } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDiaryPage } from "@/server/actions/tracking";
import { getDiaryStats } from "@/server/actions/diary";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/features/auth";
import { DiaryEntryActions } from "@/components/features/tracking/diary-entry-actions";
import { DiaryBackfillSection } from "@/components/features/tracking/diary-backfill-section";
import { DiaryFilters } from "@/components/features/tracking/diary-filters";
import { DiaryHeatmap } from "@/components/features/tracking/diary-heatmap";
import { episodeCode, groupDiaryByMonth } from "@/lib/tracking-format";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { DiaryEntryDTO } from "@/types/social";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Diary - The Movie Browser",
  description: "Your dated watch history.",
};

interface DiaryPageProps {
  searchParams: Promise<{ cursor?: string; media?: string; rewatch?: string }>;
}

/** Per-viewing 1-10 score rendered as a 5-star row (half-star precision). */
function ScoreStars({ score }: { score: number }) {
  const stars = score / 2; // 1-10 → 0.5-5
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} out of 10`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span key={i} className="relative inline-block h-3 w-3">
            <Star className="absolute inset-0 h-3 w-3 text-brand/35" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="h-3 w-3 fill-brand text-brand" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function DiaryRow({ entry }: { entry: DiaryEntryDTO }) {
  const watched = entry.watchedAt ? new Date(entry.watchedAt) : null;
  const day = watched ? watched.toLocaleDateString("en-US", { day: "numeric" }) : "—";
  const weekday = watched ? watched.toLocaleDateString("en-US", { weekday: "short" }) : "";
  const href = getMediaPath(entry.mediaType, entry.tmdbId, entry.title);

  return (
    <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <div className="w-9 flex-shrink-0 text-center">
        <p className="text-lg font-semibold leading-none tabular-nums">{day}</p>
        <p className="text-[10px] font-medium uppercase text-muted-foreground">{weekday}</p>
      </div>
      <Link
        href={href}
        prefetch={false}
        className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/50 transition-transform hover:scale-105"
      >
        {entry.posterPath && (
          <Image
            src={`${TMDB_IMAGE_BASE}/w92${entry.posterPath}`}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="44px"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={href}
          prefetch={false}
          className="block text-sm font-semibold line-clamp-1 hover:text-brand transition-colors"
        >
          {entry.title}
        </Link>
        {(entry.seasonNumber !== null || entry.episodeName) && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {entry.seasonNumber !== null && entry.episodeNumber !== null && (
              <span className="text-foreground/80">
                {episodeCode(entry.seasonNumber, entry.episodeNumber)}
              </span>
            )}
            {entry.episodeName && <span className="line-clamp-1">{entry.episodeName}</span>}
          </p>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          {entry.score !== null && <ScoreStars score={entry.score} />}
          {entry.kind === "NOTE" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Note
            </span>
          )}
          {entry.isRewatch && <Repeat className="h-3 w-3 text-brand" aria-label="Rewatch" />}
          {entry.note && <StickyNote className="h-3 w-3" aria-label="Has note" />}
          {entry.isPrivate && <EyeOff className="h-3 w-3" aria-label="Private" />}
        </div>
      </div>
      <DiaryEntryActions entry={entry} />
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-2xl font-bold leading-none tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function DiaryPage({ searchParams }: DiaryPageProps) {
  const session = await auth();
  const { cursor, media, rewatch } = await searchParams;

  if (!session?.user) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <NotebookPen className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Diary</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to keep a dated diary of everything you watch.
          </p>
          <SignInButton message="Sign in to keep your watch diary" className="mt-1" />
        </div>
      </PageMain>
    );
  }

  const mediaFilter = media === "movie" || media === "series" ? media : "all";
  const rewatchOnly = rewatch === "1";
  const isFiltering = mediaFilter !== "all" || rewatchOnly;

  // Filters apply to the WHOLE history via the query layer (not just the
  // loaded page) — keyset pagination preserves the filter on "Older entries".
  const [page, stats] = await Promise.all([
    getDiaryPage({
      cursor,
      limit: 50,
      mediaType: mediaFilter === "all" ? undefined : mediaFilter,
      rewatchOnly,
    }),
    getDiaryStats(),
  ]);

  const groups = groupDiaryByMonth(page.entries);
  const hasAnything = stats.totalEntries > 0 || page.undatedCount > 0;

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-5">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Diary</h1>

          {hasAnything && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <StatTile value={stats.uniqueTitles} label="Unique titles" />
                <StatTile value={stats.totalEntries} label="Total entries" />
                <StatTile value={stats.thisYear} label="This year" />
              </div>

              {stats.dailyActivity.length > 0 && (
                <section className="space-y-2">
                  <SectionHeading as="h2" className="text-sm">
                    Last 6 months
                  </SectionHeading>
                  <DiaryHeatmap dailyActivity={stats.dailyActivity} />
                </section>
              )}
            </>
          )}
        </header>

        {!hasAnything ? (
          <div className="rounded-xl border border-dashed bg-card/50 px-4 py-10 text-center">
            <NotebookPen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Nothing logged yet. Use the Log button on any movie or episode — the date
              defaults to today.
            </p>
            <Button asChild className="mt-4">
              <Link href="/browse">Browse something to log</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <DiaryFilters />

            {groups.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
                {isFiltering
                  ? "No matching entries. Try clearing the filters."
                  : "No dated entries yet."}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="space-y-2">
                  <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h2>
                  <div className="rounded-xl border bg-card divide-y divide-border/50">
                    {group.entries.map((entry) => (
                      <DiaryRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </section>
              ))
            )}

            {page.nextCursor && (
              <div className="flex justify-center">
                <Button asChild variant="outline" className="min-h-10">
                  <Link
                    href={buildOlderHref({ cursor: page.nextCursor, media: mediaFilter, rewatch: rewatchOnly })}
                  >
                    Older entries
                  </Link>
                </Button>
              </div>
            )}

            {!cursor && <DiaryBackfillSection count={page.undatedCount} />}
          </div>
        )}
      </div>
    </PageMain>
  );
}

/** Preserve active filters across the keyset "Older entries" link. */
function buildOlderHref(args: {
  cursor: string;
  media: "all" | "movie" | "series";
  rewatch: boolean;
}): string {
  const params = new URLSearchParams({ cursor: args.cursor });
  if (args.media !== "all") params.set("media", args.media);
  if (args.rewatch) params.set("rewatch", "1");
  return `/diary?${params.toString()}`;
}
