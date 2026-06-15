import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import {
  getPublishedCommentCount,
  getPublicCommentPage,
  getLockedCommentCount,
  getParticipantCount,
} from "@/server/db/postgres/comments";
import { getPublicTrendingRoots, getPublicLatestRoots } from "@/server/db/postgres/comments-trending";
import { getTrailerReactions } from "@/server/db/postgres/trailer-reactions";
import { getAIDataLegacy } from "@/server/services/ai-data-service";
import { TrendingCommentList } from "@/components/features/discussion/trending-comment-list";
import { DiscussionPageHeader } from "@/components/features/discussion/discussion-page-header";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseSeriesDiscussions } from "./discussions-parse";

// Re-export so the catch-all `page.tsx` imports parse + render + metadata from
// one module. The pure parse helper lives in `./discussions-parse` (no server
// imports) so it is unit-testable in isolation.
export { parseSeriesDiscussions };

async function getSeriesLite(id: number) {
  return prisma.series.findUnique({
    where: { id },
    select: { id: true, name: true, firstAirDate: true, posterPath: true },
  });
}

export async function generateSeriesDiscussionsMetadata(seriesId: number): Promise<Metadata> {
  const series = await getSeriesLite(seriesId);
  if (!series) return { title: "Discussion Not Found" };
  const title = `${series.name} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("series", series.id, series.name)}/discussions`;
  const description = truncateAtWord(
    `Spoiler-safe discussion of ${series.name} — all seasons and episodes. Comments unlock with your watch progress. Threads never archive.`,
    160,
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function SeriesDiscussionsView({ seriesId }: { seriesId: number }) {
  const series = await getSeriesLite(seriesId);
  if (!series) notFound();

  // Series-ROOT anchor (All scope). Season/Episode scope filters navigate to the
  // per-episode discuss pages (already built) — kept link-based so this page stays
  // a cacheable anon surface (no viewer gate in the render tree).
  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId: series.id,
    seasonNumber: null,
    episodeNumber: null,
  };
  const basePath = getMediaPath("series", series.id, series.name);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [
    trending,
    latest,
    publishedCount,
    initialPage,
    lockedCount,
    participantCount,
    aiSummary,
    webReactionsRaw,
  ] = await Promise.all([
    getPublicTrendingRoots(anchor),
    getPublicLatestRoots(anchor),
    getPublishedCommentCount(anchor),
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getParticipantCount(anchor),
    getAIDataLegacy(series.id, "series"),
    getTrailerReactions("series", series.id),
  ]);
  const starters = (aiSummary?.aiQuestions ?? []).slice(0, 4);
  const year = series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null;

  const jsonLd = omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: `${series.name} discussion`,
    url: canonicalUrl,
    datePublished: series.firstAirDate ? series.firstAirDate.toISOString() : undefined,
    commentCount: publishedCount,
    author: { "@type": "Organization", name: SITE_NAME },
    comment: initialPage.roots.slice(0, 10).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.createdAt,
      author: { "@type": "Person", name: c.author?.username ?? c.author?.name ?? "Member" },
    })),
    about: { "@type": "TVSeries", name: series.name, url: `${SITE_URL}${basePath}` },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: series.name, path: basePath },
    { name: "Discussion" },
  ]);

  return (
    <PageMain className="max-w-4xl mx-auto px-3 md:px-6 lg:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <DiscussionPageHeader
        basePath={basePath}
        title={series.name}
        year={year}
        posterPath={series.posterPath}
        publishedCount={publishedCount}
        participantCount={participantCount}
      />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">
        Whole-series threads below. For an episode, open its{" "}
        <Link href={`${basePath}/discuss/s1e1`} className="underline hover:text-foreground">
          per-episode discussion
        </Link>
        .
      </p>
      <div className="space-y-5" id="discussion">
        <TrendingCommentList
          anchor={anchor}
          trending={trending}
          latest={latest}
          emptyState={{ initialPage, lockedCount, starters, webReactionsRaw }}
        />
      </div>
    </PageMain>
  );
}
