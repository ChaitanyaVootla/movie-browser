import Image from "next/image";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";

interface ListPosterStackProps {
  /** Bare TMDB poster/profile file paths (e.g. "/abc.jpg"). Nulls are skipped. */
  posterPaths: (string | null | undefined)[];
  /** How many to overlap (default 3). */
  max?: number;
  className?: string;
}

/**
 * Overlaid-poster cover for a list. Extracted from the `showcase.lists` profile
 * widget (`flex -space-x-3`). Renders an empty placeholder tile when a list has
 * no art so cards never collapse. Uses `unoptimized` per DESIGN.md (CDN serves
 * WebP; the box must not run sharp).
 */
export function ListPosterStack({ posterPaths, max = 3, className }: ListPosterStackProps) {
  const paths = posterPaths.filter((p): p is string => Boolean(p)).slice(0, max);

  if (paths.length === 0) {
    return (
      <div
        className={cn(
          "flex h-16 w-11 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground",
          className
        )}
      >
        <ListChecks className="h-5 w-5" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("flex -space-x-3", className)}>
      {paths.map((path, i) => (
        <div
          key={i}
          className="relative h-16 w-11 overflow-hidden rounded-md border border-border bg-muted shadow-sm"
          style={{ zIndex: paths.length - i }}
        >
          <Image
            src={`${TMDB_IMAGE_BASE}/w92${path}`}
            alt=""
            fill
            unoptimized
            className="object-cover"
            sizes="44px"
          />
        </div>
      ))}
    </div>
  );
}
