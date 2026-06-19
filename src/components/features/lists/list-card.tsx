import Link from "next/link";
import { Globe, Lock, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListPosterStack } from "./list-poster-stack";

export interface ListCardData {
  slug: string;
  name: string;
  itemCount: number;
  isPublic: boolean;
  isRanked?: boolean;
  /** Bare TMDB poster paths for the cover stack (best-effort). */
  posterPaths?: (string | null | undefined)[];
}

interface ListCardProps {
  /** Owner whose public slug route this card links to. */
  username: string;
  list: ListCardData;
  className?: string;
}

/**
 * A list tile for the browse grid. Links to the public slug route
 * `/u/[username]/list/[slug]` — the one detail page that renders an owner-edit
 * island for the owner and read-only for everyone else.
 */
export function ListCard({ username, list, className }: ListCardProps) {
  return (
    <Link
      href={`/u/${username}/list/${list.slug}`}
      prefetch={false}
      className={cn(
        "group flex items-center gap-4 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-muted/40",
        className
      )}
    >
      <ListPosterStack posterPaths={list.posterPaths ?? []} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
          {list.name}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>
            {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
          </span>
          {list.isRanked ? (
            <span className="inline-flex items-center gap-1">
              <ListOrdered className="h-3 w-3" aria-hidden />
              Ranked
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            {list.isPublic ? (
              <>
                <Globe className="h-3 w-3" aria-hidden />
                Public
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" aria-hidden />
                Private
              </>
            )}
          </span>
        </p>
      </div>
    </Link>
  );
}
