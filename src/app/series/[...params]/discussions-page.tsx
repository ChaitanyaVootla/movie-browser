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
import { getSeries } from "@/server/actions/series";
import { extractSeriesOverviewProps } from "@/types/client-props";
import { TrendingCommentList } from "@/components/features/discussion/trending-comment-list";
import { DiscussionPageHeader } from "@/components/features/discussion/discussion-page-header";
import { DiscussionInfoSidebar } from "@/components/features/discussion/discussion-info-sidebar";
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
    fullSeries,
  ] = await Promise.all([
    getPublicTrendingRoots(anchor),
    getPublicLatestRoots(anchor),
    getPublishedCommentCount(anchor),
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getParticipantCount(anchor),
    getAIDataLegacy(series.id, "series"),
    getTrailerReactions("series", series.id),
    // Full catalog item for the "About this title" sidebar. Cacheable catalog
    // read (no auth()/headers()) — ISR-safe. Null-safe: missing item just hides
    // the sidebar.
    getSeries(series.id),
  ]);
  const starters = (aiSummary?.aiQuestions ?? []).slice(0, 4);
  const year = series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null;

  const overviewItem = fullSeries ? extractSeriesOverviewProps(fullSeries) : null;
  const englishLogo = fullSeries?.images?.logos?.find((l) => l.iso_639_1 === "en");
  const tmdbLogoPath = englishLogo?.file_path ?? fullSeries?.images?.logos?.[0]?.file_path ?? null;

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

  const sidebar = overviewItem ? (
    <DiscussionInfoSidebar
      item={overviewItem}
      mediaType="series"
      basePath={basePath}
      year={year}
      posterPath={series.posterPath}
    />
  ) : null;

  return (
    <PageMain className="max-w-6xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-6 pt-0 md:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <DiscussionPageHeader
        basePath={basePath}
        mediaType="series"
        mediaId={series.id}
        title={series.name}
        year={year}
        tmdbLogoPath={tmdbLogoPath}
        publishedCount={publishedCount}
        participantCount={participantCount}
      />
      {/* Two-column on desktop: discussion fills the main column, "About this
          title" rides the right rail. Single column on mobile (sidebar stacks
          below the discussion). */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
        <div className="space-y-5 min-w-0" id="discussion">
          <p className="-mt-3 text-sm text-muted-foreground">
            Whole-series threads below. For an episode, open its{" "}
            <Link href={`${basePath}/discuss/s1e1`} className="underline hover:text-foreground">
              per-episode discussion
            </Link>
            .
          </p>
          <TrendingCommentList
            anchor={anchor}
            trending={trending}
            latest={latest}
            emptyState={{ initialPage, lockedCount, starters, webReactionsRaw }}
          />
        </div>
        {sidebar ? (
          <div className="mt-8 lg:mt-0 lg:sticky lg:top-20">{sidebar}</div>
        ) : null}
      </div>
    </PageMain>
  );
}
