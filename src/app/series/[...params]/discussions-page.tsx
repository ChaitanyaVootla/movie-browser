import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/server/db/postgres";
import { Skeleton } from "@/components/ui/skeleton";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, discussionForumPosting } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import {
  getPublishedCommentCount,
  getPublicCommentPage,
  getLockedCommentCount,
  getParticipantCount,
} from "@/server/db/postgres/comments";
import { getPublicTrendingRoots, getPublicLatestRoots } from "@/server/db/postgres/comments-trending";
import { getTrailerReactions } from "@/server/db/postgres/trailer-reactions";
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
    // `adult` is read for the noindex gate below, not rendered.
    select: { id: true, name: true, firstAirDate: true, posterPath: true, adult: true },
  });
}

export async function generateSeriesDiscussionsMetadata(seriesId: number): Promise<Metadata> {
  const [series, publishedCount] = await Promise.all([
    getSeriesLite(seriesId),
    // Whole-series thread: both numbers null, matching the view's anchor below.
    getPublishedCommentCount({
      type: "series",
      seriesId,
      seasonNumber: null,
      episodeNumber: null,
    }),
  ]);
  if (!series) return { title: "Discussion Not Found" };
  const title = `${series.name} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("series", series.id, series.name)}/discussions`;
  const description = truncateAtWord(
    `Spoiler-safe discussion of ${series.name} — whole-series, per-season and per-episode threads. Comments unlock with your watch progress. Threads never archive.`,
    160,
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Adult titles are noindex everywhere, sub-pages included — otherwise the
    // discussions URL becomes the indexable twin of a noindexed detail page.
    // An EMPTY thread is noindex too (follow stays true) — see the long note in
    // the movie equivalent (`movie/[...params]/discussions-page.tsx`).
    ...(series.adult
      ? { robots: { index: false, follow: false } }
      : publishedCount === 0
        ? { robots: { index: false, follow: true } }
        : {}),
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function SeriesDiscussionsView({ seriesId }: { seriesId: number }) {
  // Series-ROOT anchor (All scope). Season/Episode scope filters navigate to the
  // per-episode discuss pages (already built) — kept link-based so this page stays
  // a cacheable anon surface (no viewer gate in the render tree).
  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId,
    seasonNumber: null,
    episodeNumber: null,
  };
  // Hero data only: getSeriesLite (id/name/year) + the two cheap single-COUNT
  // queries the hero band displays. Everything heavier (full catalog read for the
  // sidebar, comment page, trending/latest roots, AI starters, web reactions,
  // JSON-LD) is deferred below the Suspense boundary so the route's loading.tsx
  // resolves fast and the REAL discussions hero band — not the detail-shaped
  // loading skeleton — is the detail→discussions View-Transition capture target.
  const [series, publishedCount, participantCount] = await Promise.all([
    getSeriesLite(seriesId),
    getPublishedCommentCount(anchor),
    getParticipantCount(anchor),
  ]);
  if (!series) notFound();

  const basePath = getMediaPath("series", series.id, series.name);
  const year = series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null;

  return (
    <PageMain className="max-w-6xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-6 pt-0 md:pt-16">
      <DiscussionPageHeader
        basePath={basePath}
        mediaType="series"
        mediaId={series.id}
        title={series.name}
        year={year}
        // tmdbLogoPath omitted — HeroLogoShell resolves the CDN logo by id (the
        // deterministic, already-cached URL the detail hero uses), which is what
        // the morph needs.
        publishedCount={publishedCount}
        participantCount={participantCount}
      />
      {/* Two-column on desktop: discussion fills the main column, "About this
          title" rides the right rail. Single column on mobile (sidebar stacks
          below the discussion). All of it streams in below the hero. */}
      <Suspense fallback={<SeriesDiscussionsContentFallback />}>
        <SeriesDiscussionsContent seriesId={series.id} />
      </Suspense>
    </PageMain>
  );
}

function SeriesDiscussionsContentFallback() {
  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
      <div className="space-y-5 min-w-0">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <div className="mt-8 lg:mt-0 hidden lg:block">
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}

// Heavy reads (trending/latest roots, comment page, counts, web reactions, full
// catalog item for the sidebar) + the discussion JSON-LD.
// Rendered inside <Suspense> so the hero band above commits FIRST (View-Transition
// capture target). Cacheable catalog/comment surface — no auth()/headers() — ISR-safe.
async function SeriesDiscussionsContent({ seriesId }: { seriesId: number }) {
  const series = await getSeriesLite(seriesId);
  if (!series) notFound();

  const anchor: DiscussionAnchor = {
    type: "series",
    seriesId: series.id,
    seasonNumber: null,
    episodeNumber: null,
  };
  const basePath = getMediaPath("series", series.id, series.name);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [trending, latest, publishedCount, initialPage, lockedCount, webReactionsRaw, fullSeries] =
    await Promise.all([
      getPublicTrendingRoots(anchor),
      getPublicLatestRoots(anchor),
      getPublishedCommentCount(anchor),
      getPublicCommentPage(anchor),
      getLockedCommentCount(anchor),
      getTrailerReactions("series", series.id),
      // Full catalog item for the "About this title" sidebar. Cacheable catalog
      // read (no auth()/headers()) — ISR-safe. Null-safe: missing item just hides
      // the sidebar.
      getSeries(series.id),
    ]);
  const year = series.firstAirDate ? series.firstAirDate.getUTCFullYear() : null;

  const overviewItem = fullSeries ? extractSeriesOverviewProps(fullSeries) : null;

  // null when the thread has no published posts — see discussionForumPosting.
  const jsonLd = discussionForumPosting({
    headline: `${series.name} discussion`,
    url: canonicalUrl,
    commentCount: publishedCount,
    roots: initialPage.roots,
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
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
        <div className="space-y-5 min-w-0" id="discussion">
          <p className="-mt-3 text-sm text-muted-foreground">
            Whole-series threads below. For an episode, open its{" "}
            <Link href={`${basePath}/discuss/s1e1`} className="underline hover:text-foreground">
              per-episode discussion
            </Link>
            , or browse{" "}
            <Link href="/discussions" className="underline hover:text-foreground">
              all discussions
            </Link>{" "}
            across the site.
          </p>
          <TrendingCommentList
            anchor={anchor}
            trending={trending}
            latest={latest}
            emptyState={{ initialPage, lockedCount, starters: [], webReactionsRaw }}
          />
        </div>
        {sidebar ? (
          <div className="mt-8 lg:mt-0 lg:sticky lg:top-20">{sidebar}</div>
        ) : null}
      </div>
    </>
  );
}
