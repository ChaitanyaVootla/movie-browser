import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { PersonSliceDTO } from "@/types/social";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function PersonAvatar({ person }: { person: PersonSliceDTO }) {
  return (
    <>
      <div className="relative mx-auto mb-1.5 flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted">
        {person.profilePath ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w185${person.profilePath}`}
            alt={person.name}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {initials(person.name)}
          </span>
        )}
      </div>
      <p className="text-xs font-medium line-clamp-2 group-hover:text-brand transition-colors">
        {person.name}
      </p>
      <p className="text-[10px] font-medium text-muted-foreground">{person.count}</p>
    </>
  );
}

/**
 * Horizontal strip of top actors/directors with watch counts. Stats aggregate
 * by name in v1, so personId may be null — render unlinked with an initials
 * fallback in that case (Task 1 relaxed-DTO note).
 */
export function TopPeopleRow({ people }: { people: PersonSliceDTO[] }) {
  if (people.length === 0) return null;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      {people.map((person, i) => {
        const key = person.personId ?? `${person.name}-${i}`;
        const inner: ReactNode = <PersonAvatar person={person} />;
        return person.personId !== null ? (
          <Link
            key={key}
            href={`/person/${person.personId}`}
            prefetch={false}
            className="group w-16 flex-shrink-0 text-center"
          >
            {inner}
          </Link>
        ) : (
          <div key={key} className="group w-16 flex-shrink-0 text-center">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
