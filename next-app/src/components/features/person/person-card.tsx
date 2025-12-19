import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { CastMember, CrewMember } from "@/types";

interface PersonCardProps {
  person: CastMember | CrewMember;
  className?: string;
  size?: "sm" | "md";
}

function getSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isCastMember(person: CastMember | CrewMember): person is CastMember {
  return "character" in person;
}

export function PersonCard({ person, className, size = "md" }: PersonCardProps) {
  const role = isCastMember(person) ? person.character : person.job;
  const href = `/person/${person.id}/${getSlug(person.name)}`;

  const imageSize = size === "sm" ? "w-16 h-24" : "w-20 h-28 md:w-24 md:h-36";
  const cardWidth = size === "sm" ? "w-16" : "w-20 md:w-24";

  return (
    <Link
      href={href}
      className={cn("flex-shrink-0 group", cardWidth, className)}
    >
      {/* Profile Image */}
      <div
        className={cn(
          "relative rounded-lg overflow-hidden bg-muted",
          "ring-2 ring-transparent group-hover:ring-primary/50 transition-all",
          imageSize
        )}
      >
        {person.profile_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w185${person.profile_path}`}
            alt={`${person.name}${role ? ` as ${role}` : ""}`}
            fill
            className="object-cover object-top"
            sizes={size === "sm" ? "64px" : "96px"}
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-xl md:text-2xl font-light text-muted-foreground/50">
              {person.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <h3
        className={cn(
          "mt-1.5 font-medium line-clamp-2 group-hover:text-primary transition-colors",
          size === "sm" ? "text-xs" : "text-xs md:text-sm"
        )}
      >
        {person.name}
      </h3>

      {/* Role */}
      {role && (
        <p
          className={cn(
            "text-muted-foreground line-clamp-2 mt-0.5",
            size === "sm" ? "text-[10px]" : "text-[10px] md:text-xs"
          )}
        >
          {role}
        </p>
      )}
    </Link>
  );
}

// Compact variant for inline lists
export function PersonCardCompact({
  person,
  className,
}: {
  person: CastMember | CrewMember;
  className?: string;
}) {
  const role = isCastMember(person) ? person.character : person.job;
  const href = `/person/${person.id}/${getSlug(person.name)}`;

  return (
    <Link href={href} className={cn("flex items-center gap-2 group", className)}>
      {/* Small avatar */}
      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
        {person.profile_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w185${person.profile_path}`}
            alt={person.name}
            fill
            className="object-cover object-top"
            sizes="40px"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-sm font-light text-muted-foreground/50">
              {person.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
          {person.name}
        </p>
        {role && <p className="text-xs text-muted-foreground line-clamp-1">{role}</p>}
      </div>
    </Link>
  );
}

