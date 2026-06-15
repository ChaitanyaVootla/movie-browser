import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getPublicCommentPage,
  getLockedCommentCount,
  getPublishedCommentCount,
} from "@/server/db/postgres/comments";
import { CommentListClient } from "@/components/features/discussion/comment-list-client";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseDiscussionsParams } from "./parse";

// ISR — user-agnostic; viewer state hydrates client-side (spec invariant 1).
export const revalidate = 3600;
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ params: string[] }>;
}

async function getMovieLite(id: number) {
  return prisma.movie.findUnique({ where: { id }, select: { id: true, title: true, releaseDate: true } });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const id = parseDiscussionsParams(routeParams);
  if (id === null) return { title: "Discussion Not Found" };
  const movie = await getMovieLite(id);
  if (!movie) return { title: "Discussion Not Found" };
  const title = `${movie.title} Discussion | ${SITE_NAME}`;
  const canonical = `${SITE_URL}${getMediaPath("movie", movie.id, movie.title)}/discussions`;
  const description = truncateAtWord(
    `Join the spoiler-safe discussion of ${movie.title}. Threads never archive.`,
    160
  );
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function MovieDiscussionsPage({ params }: PageProps) {
  const { params: routeParams } = await params;
  const id = parseDiscussionsParams(routeParams);
  if (id === null) notFound();
  const movie = await getMovieLite(id);
  if (!movie) notFound();

  const anchor: DiscussionAnchor = { type: "movie", movieId: movie.id };
  const basePath = getMediaPath("movie", movie.id, movie.title);
  const canonicalUrl = `${SITE_URL}${basePath}/discussions`;

  const [initialPage, lockedCount, publishedCount] = await Promise.all([
    getPublicCommentPage(anchor),
    getLockedCommentCount(anchor),
    getPublishedCommentCount(anchor),
  ]);

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
    <PageMain className="max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <header className="space-y-2 mb-6">
        <a
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
        >
          {movie.title}
        </a>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{movie.title} — Discussion</h1>
      </header>
      <div className="space-y-6" id="discussion">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5 text-brand" />}>Discussion</SectionHeading>
        <CommentListClient
          anchor={anchor}
          initialPage={initialPage}
          lockedCount={lockedCount}
          starters={[]}
          defaultScope="NONE"
        />
      </div>
    </PageMain>
  );
}
