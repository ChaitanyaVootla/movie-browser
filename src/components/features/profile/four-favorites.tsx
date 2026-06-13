import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { FavoriteItemDTO } from "@/types/social";

/** Four Favorites — the Letterboxd-proven constrained self-expression module. */
export function FourFavorites({ favorites }: { favorites: FavoriteItemDTO[] }) {
  if (favorites.length === 0) return null;

  return (
    <section className="space-y-4">
      <SectionHeading icon={<Star className="h-5 w-5 text-brand" />}>Four Favorites</SectionHeading>
      <div className="grid grid-cols-4 gap-3 md:gap-4 max-w-xl">
        {favorites.slice(0, 4).map((item) => (
          <Link
            key={`${item.mediaType}-${item.tmdbId}`}
            href={getMediaPath(item.mediaType, item.tmdbId, item.title)}
            prefetch={false}
            className="group"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
              {item.posterPath && (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w342${item.posterPath}`}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 25vw, 144px"
                />
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-tight font-medium line-clamp-2 group-hover:text-brand transition-colors">
              {item.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
