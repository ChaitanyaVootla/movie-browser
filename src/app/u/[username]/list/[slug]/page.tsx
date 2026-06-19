import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Globe, ListOrdered, User as UserIcon } from "lucide-react";
import { getPublicListBySlug as getPublicListBySlugBase } from "@/server/db/postgres/social/public-list";
import { PageMain } from "@/components/features/layout/page-main";
import { ListDetailClient } from "@/components/features/lists/list-detail-client";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
import { getMediaPath, truncateAtWord } from "@/lib/utils";

// Deduplicate the fetch across generateMetadata + render within one request.
const getPublicList = cache(getPublicListBySlugBase);

// ISR — short revalidate, mirroring /u/[username]. NO viewer data in the cached
// render tree; owner controls hydrate client-side in <ListDetailClient/>.
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
  const data = await getPublicList(username.toLowerCase(), slug);
  if (!data) notFound();

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

function ListJsonLd({ data }: { data: NonNullable<Awaited<ReturnType<typeof getPublicList>>> }) {
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

export default async function ListDetailPage({ params }: ListPageProps) {
  const { username, slug } = await params;
  const data = await getPublicList(username.toLowerCase(), slug);
  if (!data) notFound();

  const { owner, list, items } = data;

  return (
    <PageMain>
      <ListJsonLd data={data} />

      <header className="space-y-3">
        <Link
          href={`/u/${owner.username}`}
          prefetch={false}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {owner.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google avatar host, not TMDB CDN
            <img
              src={owner.image}
              alt=""
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              <UserIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {owner.name ?? `@${owner.username}`}
        </Link>

        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{list.name}</h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium">
            {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
          </span>
          {list.isRanked ? (
            <span className="inline-flex items-center gap-1">
              <ListOrdered className="h-3.5 w-3.5" aria-hidden />
              Ranked
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" aria-hidden />
            Public list
          </span>
        </div>

        {list.description ? (
          <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {list.description}
          </p>
        ) : null}
      </header>

      {/* Server-rendered, public item grid (no viewer data → edge-cacheable). */}
      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">This list is empty.</p>
      ) : (
        <ol className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {items.map((item, i) => (
            <li key={item.id}>
              <Link
                href={getMediaPath(item.mediaType, item.tmdbId, item.title)}
                prefetch={false}
                className="group block"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-transparent transition-all duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-brand/60">
                  {item.posterPath ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w342${item.posterPath}`}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width:640px) 30vw, (max-width:1024px) 18vw, 140px"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                      {item.title}
                    </span>
                  )}
                  {list.isRanked ? (
                    <span className="absolute left-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-black/70 px-1.5 text-[11px] font-bold text-white backdrop-blur-sm">
                      {i + 1}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground/90 transition-colors group-hover:text-brand">
                  {item.title}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {/* Owner-edit island — renders nothing for non-owners; keeps page cacheable. */}
      <ListDetailClient
        listId={list.id}
        username={owner.username}
        initialName={list.name}
        initialDescription={list.description}
        initialIsPublic
      />
    </PageMain>
  );
}
