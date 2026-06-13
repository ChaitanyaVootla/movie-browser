import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { EyeOff, NotebookPen, Repeat, StickyNote } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDiaryPage } from "@/server/actions/tracking";
import { PageMain } from "@/components/features/layout/page-main";
import { Button } from "@/components/ui/button";
import { DiaryEntryActions } from "@/components/features/tracking/diary-entry-actions";
import { DiaryBackfillSection } from "@/components/features/tracking/diary-backfill-section";
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
  searchParams: Promise<{ cursor?: string }>;
}

function DiaryRow({ entry }: { entry: DiaryEntryDTO }) {
  const day = entry.watchedAt
    ? new Date(entry.watchedAt).toLocaleDateString("en-US", { day: "numeric" })
    : "—";
  const weekday = entry.watchedAt
    ? new Date(entry.watchedAt).toLocaleDateString("en-US", { weekday: "short" })
    : "";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 flex-shrink-0 text-center">
        <p className="text-lg font-semibold leading-none">{day}</p>
        <p className="text-[10px] font-medium uppercase text-muted-foreground">{weekday}</p>
      </div>
      <Link
        href={getMediaPath(entry.mediaType, entry.tmdbId, entry.title)}
        prefetch={false}
        className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-muted"
      >
        {entry.posterPath && (
          <Image
            src={`${TMDB_IMAGE_BASE}/w92${entry.posterPath}`}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="40px"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={getMediaPath(entry.mediaType, entry.tmdbId, entry.title)}
          prefetch={false}
          className="text-sm font-medium line-clamp-1 hover:text-brand transition-colors"
        >
          {entry.title}
        </Link>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {entry.seasonNumber !== null && entry.episodeNumber !== null && (
            <span>{episodeCode(entry.seasonNumber, entry.episodeNumber)}</span>
          )}
          {entry.episodeName && <span className="line-clamp-1">{entry.episodeName}</span>}
          {entry.isRewatch && <Repeat className="h-3 w-3 text-brand" aria-label="Rewatch" />}
          {entry.note && <StickyNote className="h-3 w-3" aria-label="Has note" />}
          {entry.isPrivate && <EyeOff className="h-3 w-3" aria-label="Private" />}
        </p>
      </div>
      <DiaryEntryActions entry={entry} />
    </div>
  );
}

export default async function DiaryPage({ searchParams }: DiaryPageProps) {
  const session = await auth();
  const { cursor } = await searchParams;

  if (!session?.user) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <NotebookPen className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Diary</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to keep a dated diary of everything you watch.
          </p>
        </div>
      </PageMain>
    );
  }

  const page = await getDiaryPage({ cursor, limit: 50 });
  const groups = groupDiaryByMonth(page.entries);

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Diary</h1>

        {groups.length === 0 && page.undatedCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing logged yet. Use the Log button on any movie or episode — the date
            defaults to today.
          </p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.key} className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">{group.label}</h2>
                <div className="rounded-xl border bg-card divide-y divide-border/50">
                  {group.entries.map((entry) => (
                    <DiaryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            ))}

            {page.nextCursor && (
              <div className="flex justify-center">
                <Button asChild variant="outline">
                  <Link href={`/diary?cursor=${encodeURIComponent(page.nextCursor)}`}>
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
