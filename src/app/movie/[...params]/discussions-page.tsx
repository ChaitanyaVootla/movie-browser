import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { Skeleton } from "@/components/ui/skeleton";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, discussionForumPosting } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import {
  getPublicCommentPage,
  getLockedCommentCount,
  getPublishedCommentCount,
  getParticipantCount,
} from "@/server/db/postgres/comments";
import { getTrailerReactions } from "@/server/db/postgres/trailer-reactions";
import { getMovie } from "@/server/actions/movie";
import { extractMovieOverviewProps } from "@/types/client-props";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import { DiscussionPageHeader } from "@/components/features/discussion/discussion-page-header";
import { DiscussionInfoSidebar } from "@/components/features/discussion/discussion-info-sidebar";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseMovieDiscussions } from "./discussions-parse";

// Re-export so the catch-all `page.tsx` imports parse + render + metadata from
// one module. The pure parse helper lives in `./discussions-parse` (no server
// imports) so it is unit-testable in isolation.
export { parseMovieDiscussions };

async function getMovieLite(id: number) {
  return prisma.movie.findUnique({
    where: { id },
    // `adult` is read for the noindex gate below, not rendered.
    select: { id: true, title: true, releaseDate: true, posterPath: true, adult: true },
  });
}

export async function generateMovieDiscussionsMetadata(movieId: number): Promise<Metadata> {
  const movie = await getMovieLite(movieId);
  if (!movie) return { title: "Discussion Not Found" };
  const title = `${movie.title} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("movie", movie.id, movie.title)}/discussions`;
  const description = truncateAtWord(
    `Join the spoiler-safe discussion of ${movie.title}. Comments unlock with your watch progress — no spoilers before you're ready. Threads never archive.`,
    160,
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Adult titles are noindex everywhere, sub-pages included — otherwise the
    // discussions URL becomes the indexable twin of a noindexed detail page.
    ...(movie.adult ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export async function MovieDiscussionsView({ movieId }: { movieId: number }) {
  // ONLY the cheap hero data is awaited at the top level so the route's Suspense
  // boundary (loading.tsx) resolves fast and the REAL discussions hero band
  // (DiscussionPageHeader, with the named `hero-backdrop`/`hero-logo` elements)
  // is what paints and commits. That makes the detail→discussions shared-element
  // View Transition capture the real hero — not the detail-shaped loading
  // skeleton — so the backdrop squishes tall→band and the logo lands correctly.
  // All heavier reads (full catalog item for the sidebar, comment list, trending
  // + JSON-LD) stream in below via <Suspense> without blocking the hero.
  const anchor: DiscussionAnchor = { type: "movie", movieId };
  // Hero data only: getMovieLite (id/title/year) + the two cheap single-COUNT
  // queries the hero band displays. Everything heavier (full catalog read for
  // the sidebar, comment page, AI starters, web reactions, JSON-LD) is deferred
  // below the Suspense boundary so the hero stays the morph capture target.
  const [movie, publishedCount, participantCount] = await Promise.all([
    getMovieLite(movieId),
    getPublishedCommentCount(anchor),
    getParticipantCount(anchor),
  ]);
  if (!movie) notFound();

  const basePath = getMediaPath("movie", movie.id, movie.title);
  const year = movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null;

  return (
    <PageMain className="max-w-6xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-6 pt-0 md:pt-16">
      <DiscussionPageHeader
        basePath={basePath}
        mediaType="movie"
        mediaId={movie.id}
        title={movie.title}
        year={year}
        // tmdbLogoPath omitted — HeroLogoShell resolves the CDN logo by id (the
        // deterministic, already-cached URL the detail hero uses), which is what
        // the morph needs. The TMDB-path fallback is irrelevant for the morph.
        publishedCount={publishedCount}
        participantCount={participantCount}
      />
      {/* Two-column on desktop: discussion fills the main column, "About this
          title" rides the right rail. Single column on mobile (sidebar stacks
          below the discussion). All of it streams in below the hero. */}
      <Suspense fallback={<MovieDiscussionsContentFallback />}>
        <MovieDiscussionsContent movieId={movie.id} />
      </Suspense>
    </PageMain>
  );
}

function MovieDiscussionsContentFallback() {
  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
      <div className="space-y-5 min-w-0">
        <Skeleton className="h-5 w-28" />
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

// Heavy reads (comment list, counts, web reactions, full catalog item for the
// sidebar) + the discussion JSON-LD. Rendered inside <Suspense> so the hero
// band above commits FIRST (View-Transition capture target). This is a
// cacheable catalog/comment surface — no auth()/headers() — ISR-safe.
async function MovieDiscussionsContent({ movieId }: { movieId: number }) {
  const movie = await getMovieLite(movieId);
  if (!movie) notFound();

  const anchor: DiscussionAnchor = { type: "movie", movieId: movie.id };
  const basePath = getMediaPath("movie", movie.id, movie.title);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [initialPage, lockedCount, publishedCount, webReactionsRaw, fullMovie] =
    await Promise.all([
      getPublicCommentPage(anchor),
      getLockedCommentCount(anchor),
      getPublishedCommentCount(anchor),
      getTrailerReactions("movie", movie.id),
      // Full catalog item for the "About this title" sidebar. Cacheable catalog
      // read (no auth()/headers()) — ISR-safe. Null-safe: missing item just hides
      // the sidebar.
      getMovie(movie.id),
    ]);
  const year = movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null;

  const overviewItem = fullMovie ? extractMovieOverviewProps(fullMovie) : null;

  // null when the thread has no published posts — an empty shell is exactly what
  // Search Console rejected ("Either text, image, or video should be specified").
  const jsonLd = discussionForumPosting({
    headline: `${movie.title} discussion`,
    url: canonicalUrl,
    commentCount: publishedCount,
    roots: initialPage.roots,
    about: { "@type": "Movie", name: movie.title, url: `${SITE_URL}${basePath}` },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: movie.title, path: basePath },
    { name: "Discussion" },
  ]);

  const sidebar = overviewItem ? (
    <DiscussionInfoSidebar
      item={overviewItem}
      mediaType="movie"
      basePath={basePath}
      year={year}
      posterPath={movie.posterPath}
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-brand" />
              Newest first
            </div>
            {/* De-orphan link: the cross-catalog hub is otherwise only reachable
                from the footer (server-rendered, viewer-agnostic — ISR-safe) */}
            <Link
              href="/discussions"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              All discussions
            </Link>
          </div>
          <CommentListClient
            anchor={anchor}
            initialPage={initialPage}
            lockedCount={lockedCount}
            starters={[]}
            defaultScope="NONE"
            richEmptyState
            webReactionsRaw={webReactionsRaw}
          />
        </div>
        {sidebar ? (
          <div className="mt-8 lg:mt-0 lg:sticky lg:top-20">{sidebar}</div>
        ) : null}
      </div>
    </>
  );
}
