import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, discussionForumPosting } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getLockedCommentCount,
  getPublicCommentPage,
  getPublishedCommentCount,
} from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import {
  EpisodePicker,
  type EpisodeNavItem,
} from "@/components/features/discussion/episode-picker";
import { ThreadSummaryCard } from "@/components/features/discussion/thread-summary-card";
import { DiscussionEntryStrip } from "@/components/features/discussion/discussion-entry-strip";

export interface DiscussParams {
  seriesId: number;
  season: number;
  episode: number;
}

/** Parse ["1396","breaking-bad","discuss","s2e5"] | ["1396","discuss","s2e5"] → DiscussParams */
export function parseDiscussParams(routeParams: string[]): DiscussParams | null {
  const last = routeParams[routeParams.length - 1];
  const beforeLast = routeParams[routeParams.length - 2];
  if (beforeLast !== "discuss" || routeParams.length < 3 || routeParams.length > 4) return null;
  const id = parseInt(routeParams[0], 10);
  const match = /^s(\d{1,2})e(\d{1,3})$/.exec(last ?? "");
  if (isNaN(id) || !match) return null;
  return { seriesId: id, season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
}

// One PG round trip for series + all episode nav data; cache() dedups
// between generateMetadata and the page render (same pattern as getMovie).
export const getDiscussData = cache(async (seriesId: number) => {
  return prisma.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      name: true,
      // `adult` is read for the noindex gate in generateDiscussMetadata.
      adult: true,
      seasons: {
        where: { seasonNumber: { gt: 0 } },
        orderBy: { seasonNumber: "asc" },
        select: {
          seasonNumber: true,
          episodes: {
            orderBy: { episodeNumber: "asc" },
            select: { episodeNumber: true, name: true, overview: true, airDate: true },
          },
        },
      },
    },
  });
});

export async function generateDiscussMetadata(p: DiscussParams): Promise<Metadata> {
  const [series, publishedCount] = await Promise.all([
    getDiscussData(p.seriesId),
    getPublishedCommentCount({
      type: "series",
      seriesId: p.seriesId,
      seasonNumber: p.season,
      episodeNumber: p.episode,
    }),
  ]);
  const episode = series?.seasons
    .find((s) => s.seasonNumber === p.season)
    ?.episodes.find((e) => e.episodeNumber === p.episode);
  if (!series) return { title: "Discussion Not Found" };
  const epName = episode?.name ? ` — "${episode.name}"` : "";
  const title = `${series.name} S${p.season}E${p.episode}${epName} Discussion | ${SITE_NAME}`;
  const description = truncateAtWord(
    `Spoiler-safe discussion of ${series.name} Season ${p.season} Episode ${p.episode}${epName}. Comments unlock with your watch progress — no spoilers before you're ready. Threads never archive.`,
    160
  );
  const canonical = `${SITE_URL}${getMediaPath("series", series.id, series.name)}/discuss/s${p.season}e${p.episode}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Adult titles are noindex everywhere, per-episode pages included.
    // An EMPTY thread is noindex too (follow stays true) — see the long note in
    // `movie/[...params]/discussions-page.tsx`. This is the HIGHEST-volume
    // discussion surface by far (one URL per EPISODE of every series), so it is
    // also where empty shells did the most crawl-budget damage — most of the 241
    // invalid `DiscussionForumPosting` items GSC rejected were episode pages.
    ...(series.adult
      ? { robots: { index: false, follow: false } }
      : publishedCount === 0
        ? { robots: { index: false, follow: true } }
        : {}),
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function EpisodeDiscussPage({ params }: { params: DiscussParams }) {
  const series = await getDiscussData(params.seriesId);
  const season = series?.seasons.find((s) => s.seasonNumber === params.season);
  const episode = season?.episodes.find((e) => e.episodeNumber === params.episode);
  if (!series || !episode) {
    // Soft-404 fallback (proxy verified the SERIES; episode existence is
    // page-level — see media-resolver comment). Renders not-found UI.
    notFound();
  }

  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId: series.id,
    seasonNumber: params.season,
    episodeNumber: params.episode,
  };
  const basePath = getMediaPath("series", series.id, series.name);
  const canonicalUrl = `${SITE_URL}${basePath}/discuss/s${params.season}e${params.episode}`;

  // Anon-cacheable tier only (invariant 8): NONE-scope comments + counts.
  const [initialPage, lockedCount, publishedCount] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getPublishedCommentCount(anchor),
  ]);

  const episodeNav: EpisodeNavItem[] = series.seasons.flatMap((s) =>
    s.episodes.map((e) => ({
      seasonNumber: s.seasonNumber,
      episodeNumber: e.episodeNumber,
      name: e.name,
    }))
  );

  // DiscussionForumPosting structured data (Google's discussion-forum format),
  // fed ONLY from the spoiler-free tier — exactly what crawlers may index.
  // null when the thread has no published posts — see discussionForumPosting.
  // Per-episode pages are the highest-volume discussion surface, so most of the
  // 241 invalid items in Search Console were empty episode shells.
  const jsonLd = discussionForumPosting({
    headline: `${series.name} S${params.season}E${params.episode}${episode.name ? ` — ${episode.name}` : ""} discussion`,
    url: canonicalUrl,
    commentCount: publishedCount,
    roots: initialPage.roots,
    about: {
      "@type": "TVEpisode",
      name: episode.name ?? `Episode ${params.episode}`,
      episodeNumber: params.episode,
      partOfSeason: { "@type": "TVSeason", seasonNumber: params.season },
      partOfSeries: { "@type": "TVSeries", name: series.name, url: `${SITE_URL}${basePath}` },
    },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: series.name, path: basePath },
    { name: `S${params.season}E${params.episode} Discussion` },
  ]);

  return (
    <PageMain className="max-w-3xl mx-auto">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <header className="space-y-2 mb-6">
        <Link
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
        >
          {series.name}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          S{params.season}E{params.episode}
          {episode.name ? ` · ${episode.name}` : ""}
        </h1>
        {episode.overview && (
          <p className="text-sm text-muted-foreground line-clamp-3">{episode.overview}</p>
        )}
      </header>

      <div className="space-y-6">
        <EpisodePicker
          basePath={basePath}
          episodes={episodeNav}
          currentSeason={params.season}
          currentEpisode={params.episode}
        />

        <Link
          href={`${basePath}/discussions`}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          ← All {series.name} discussions
        </Link>
        <DiscussionEntryStrip anchor={anchor} title={series.name} />

        <SectionHeading icon={<MessagesSquare className="h-5 w-5 text-brand" />}>
          Discussion
        </SectionHeading>
        <ThreadSummaryCard anchor={anchor} />
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={[]}
          defaultScope="EPISODE"
          defaultScopeSeason={params.season}
          defaultScopeEpisode={params.episode}
        />
      </div>
    </PageMain>
  );
}
