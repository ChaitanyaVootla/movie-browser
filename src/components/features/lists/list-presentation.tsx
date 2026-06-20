import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Globe, ListOrdered, Lock } from "lucide-react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { getMediaPath } from "@/lib/utils";
import type { AvatarCrop } from "@/lib/avatar-crop";
import { UserAvatar } from "@/components/features/profile/user-avatar";

/**
 * Pure, presentational list-detail building blocks shared by the server-rendered
 * (ISR-cached, public) body and the client owner-fresh body — so a public list
 * and the owner's view of it look identical. NO "use client": this renders in
 * both a Server Component (the cached public body) and a Client Component (the
 * owner body); it must stay free of hooks/browser APIs to be usable in both.
 */

export interface ListItemView {
  id: number;
  mediaType: "movie" | "series" | "person";
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export function ListHeader({
  owner,
  name,
  itemCount,
  isRanked,
  isPublic,
  description,
  action,
}: {
  owner: {
    username: string;
    name: string | null;
    image: string | null;
    avatarUrl?: string | null;
    avatarCrop?: AvatarCrop | null;
  };
  name: string;
  itemCount: number;
  isRanked: boolean;
  isPublic: boolean;
  description: string | null;
  /** Optional owner control rendered beside the title (e.g. an Edit toggle). */
  action?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link
        href={`/u/${owner.username}`}
        prefetch={false}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <UserAvatar
          src={owner.avatarUrl ?? owner.image}
          crop={owner.avatarCrop}
          name={owner.name ?? owner.username}
          className="h-6 w-6"
          fallbackClassName="text-[10px]"
        />
        {owner.name ?? `@${owner.username}`}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium">
          {itemCount} {itemCount === 1 ? "title" : "titles"}
        </span>
        {isRanked ? (
          <span className="inline-flex items-center gap-1">
            <ListOrdered className="h-3.5 w-3.5" aria-hidden />
            Ranked
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          {isPublic ? (
            <>
              <Globe className="h-3.5 w-3.5" aria-hidden />
              Public list
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Private list
            </>
          )}
        </span>
      </div>

      {description ? (
        <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {description}
        </p>
      ) : null}
    </header>
  );
}

export function ListItemGrid({
  items,
  isRanked,
}: {
  items: ListItemView[];
  isRanked: boolean;
}) {
  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This list is empty.</p>;
  }
  return (
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
              {isRanked ? (
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
  );
}
