import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import {
  getPublicCommentPage,
  getLockedCommentCount,
  getPublishedCommentCount,
  getParticipantCount,
} from "@/server/db/postgres/comments";
import { getTrailerReactions } from "@/server/db/postgres/trailer-reactions";
import { getAIDataLegacy } from "@/server/services/ai-data-service";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import { DiscussionPageHeader } from "@/components/features/discussion/discussion-page-header";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseMovieDiscussions } from "./discussions-parse";

// Re-export so the catch-all `page.tsx` imports parse + render + metadata from
// one module. The pure parse helper lives in `./discussions-parse` (no server
// imports) so it is unit-testable in isolation.
export { parseMovieDiscussions };

async function getMovieLite(id: number) {
  return prisma.movie.findUnique({
    where: { id },
    select: { id: true, title: true, releaseDate: true, posterPath: true },
  });
}

export async function generateMovieDiscussionsMetadata(movieId: number): Promise<Metadata> {
  const movie = await getMovieLite(movieId);
  if (!movie) return { title: "Discussion Not Found" };
  const title = `${movie.title} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("movie", movie.id, movie.title)}/discussions`;
  const description = truncateAtWord(
    `Join the spoiler-safe discussion of ${movie.title}. Threads never archive.`,
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

export async function MovieDiscussionsView({ movieId }: { movieId: number }) {
  const movie = await getMovieLite(movieId);
  if (!movie) notFound();

  const anchor: DiscussionAnchor = { type: "movie", movieId: movie.id };
  const basePath = getMediaPath("movie", movie.id, movie.title);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [initialPage, lockedCount, publishedCount, participantCount, aiSummary, webReactionsRaw] =
    await Promise.all([
      getPublicCommentPage(anchor),
      getLockedCommentCount(anchor),
      getPublishedCommentCount(anchor),
      getParticipantCount(anchor),
      getAIDataLegacy(movie.id, "movie"),
      getTrailerReactions("movie", movie.id),
    ]);
  const starters = (aiSummary?.aiQuestions ?? []).slice(0, 4);
  const year = movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null;

  const jsonLd = omitEmpty({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: `${movie.title} discussion`,
    url: canonicalUrl,
    datePublished: movie.releaseDate ? movie.releaseDate.toISOString() : undefined,
    commentCount: publishedCount,
    author: { "@type": "Organization", name: SITE_NAME },
    comment: initialPage.roots.slice(0, 10).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.createdAt,
      author: { "@type": "Person", name: c.author?.username ?? c.author?.name ?? "Member" },
    })),
    about: { "@type": "Movie", name: movie.title, url: `${SITE_URL}${basePath}` },
  });
  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: movie.title, path: basePath },
    { name: "Discussion" },
  ]);

  return (
    <PageMain className="max-w-3xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-6 pt-0 md:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <DiscussionPageHeader
        basePath={basePath}
        mediaType="movie"
        mediaId={movie.id}
        title={movie.title}
        year={year}
        publishedCount={publishedCount}
        participantCount={participantCount}
      />
      <div className="space-y-5" id="discussion">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-brand" />
          Newest first
        </div>
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={starters}
          defaultScope="NONE"
          richEmptyState
          webReactionsRaw={webReactionsRaw}
        />
      </div>
    </PageMain>
  );
}
