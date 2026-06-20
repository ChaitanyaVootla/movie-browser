import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getListPageData as getListPageDataBase } from "@/server/db/postgres/social/public-list";
import { PageMain } from "@/components/features/layout/page-main";
import { ListHeader, ListItemGrid } from "@/components/features/lists/list-presentation";
import { ListOwnerSwitch } from "@/components/features/lists/list-owner-switch";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
import { getMediaPath, truncateAtWord } from "@/lib/utils";

// Deduplicate the fetch across generateMetadata + render within one request.
const getListPage = cache(getListPageDataBase);

// ISR — short revalidate, mirroring /u/[username]. NO viewer data in the cached
// render tree; owner controls + private content hydrate client-side in
// <ListOwnerSwitch/> (→ OwnerListBody) via the owner-scoped getList action.
export const revalidate = 300;

// REQUIRED for ISR on dynamic routes — without it `revalidate` is a no-op.
export function generateStaticParams(): { username: string; slug: string }[] {
  return [];
}

interface ListPageProps {
  params: Promise<{ username: string; slug: string }>;
}

export async function generateMetadata({ params }: ListPageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const data = await getListPage(username.toLowerCase(), slug);
  if (!data) notFound();

  // Private list: keep the name/content out of metadata + the index. The owner
  // sees the real list via client hydration; visitors get a generic notice.
  if (data.visibility === "PRIVATE") {
    return {
      title: { absolute: `Private list | ${SITE_NAME}` },
      robots: { index: false, follow: false },
    };
  }

  const ownerName = data.owner.name ?? `@${data.owner.username}`;
  const title = `${data.list.name} — a list by ${ownerName} | ${SITE_NAME}`;
  const description = truncateAtWord(
    data.list.description?.trim()
      ? data.list.description
      : `${data.list.itemCount} ${data.list.itemCount === 1 ? "title" : "titles"} in ${ownerName}'s list "${data.list.name}" on ${SITE_NAME}.`,
    160
  );
  const canonical = `${SITE_URL}/u/${data.owner.username}/list/${data.list.slug}`;
  const ogPoster = data.items.find((i) => i.posterPath)?.posterPath;
  const ogImage = ogPoster ? `${TMDB_IMAGE_BASE}/w500${ogPoster}` : undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      images: ogImage ? [{ url: ogImage, alt: data.list.name }] : [],
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

function ListJsonLd({
  data,
}: {
  data: Extract<NonNullable<Awaited<ReturnType<typeof getListPage>>>, { visibility: "PUBLIC" }>;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: data.list.name,
    description: data.list.description ?? undefined,
    numberOfItems: data.list.itemCount,
    url: `${SITE_URL}/u/${data.owner.username}/list/${data.list.slug}`,
    itemListOrder: data.list.isRanked
      ? "https://schema.org/ItemListOrderAscending"
      : "https://schema.org/ItemListUnordered",
    itemListElement: data.items.slice(0, 50).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${getMediaPath(item.mediaType, item.tmdbId, item.title)}`,
      name: item.title,
    })),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

/** Viewer-agnostic placeholder cached for a private list (no name/items leaked). */
function PrivateListNotice() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">This list is private</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The owner hasn&apos;t made this list public. If it&apos;s yours, sign in to view it.
      </p>
    </div>
  );
}

export default async function ListDetailPage({ params }: ListPageProps) {
  const { username, slug } = await params;
  const data = await getListPage(username.toLowerCase(), slug);
  if (!data) notFound();

  const listId = data.visibility === "PUBLIC" ? data.list.id : data.listId;

  return (
    <PageMain>
      {data.visibility === "PUBLIC" ? <ListJsonLd data={data} /> : null}

      {/* Owner hydrates the fresh/private body client-side; everyone else gets
          this cached, zero-JS body (public grid or private placeholder). */}
      <ListOwnerSwitch listId={listId} ownerUsername={data.owner.username}>
        {data.visibility === "PUBLIC" ? (
          <>
            <ListHeader
              owner={data.owner}
              name={data.list.name}
              itemCount={data.list.itemCount}
              isRanked={data.list.isRanked}
              isPublic
              description={data.list.description}
            />
            <ListItemGrid items={data.items} isRanked={data.list.isRanked} />
          </>
        ) : (
          <PrivateListNotice />
        )}
      </ListOwnerSwitch>
    </PageMain>
  );
}
