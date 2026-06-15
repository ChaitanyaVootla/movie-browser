import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/server/db/postgres";
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { breadcrumbList, omitEmpty } from "@/lib/seo/jsonld";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import {
  getPublishedCommentCount,
  getPublicCommentPage,
} from "@/server/db/postgres/comments";
import { getPublicTrendingRoots, getPublicLatestRoots } from "@/server/db/postgres/comments-trending";
import { TrendingCommentList } from "@/components/features/discussion/trending-comment-list";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { parseSeriesDiscussions } from "./discussions-parse";

// Re-export so the catch-all `page.tsx` imports parse + render + metadata from
// one module. The pure parse helper lives in `./discussions-parse` (no server
// imports) so it is unit-testable in isolation.
export { parseSeriesDiscussions };

async function getSeriesLite(id: number) {
  return prisma.series.findUnique({
    where: { id },
    select: { id: true, name: true, firstAirDate: true },
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

  const [trending, latest, publishedCount, initialPage] = await Promise.all([
    getPublicTrendingRoots(anchor),
    getPublicLatestRoots(anchor),
    getPublishedCommentCount(anchor),
    getPublicCommentPage(anchor),
  ]);

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
    <PageMain className="max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <header className="space-y-2 mb-6">
        <Link
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
        >
          {series.name}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{series.name} — Discussion</h1>
        <p className="text-sm text-muted-foreground">
          Whole-series threads below. For an episode, open its{" "}
          <Link href={`${basePath}/discuss/s1e1`} className="underline hover:text-foreground">
            per-episode discussion
          </Link>
          .
        </p>
      </header>
      <div className="space-y-6" id="discussion">
        <SectionHeading icon={<MessagesSquare className="h-5 w-5 text-brand" />}>
          Series discussion
        </SectionHeading>
        <TrendingCommentList anchor={anchor} trending={trending} latest={latest} />
      </div>
    </PageMain>
  );
}
