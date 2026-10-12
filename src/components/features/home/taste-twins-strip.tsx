"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import { ScrollContainer } from "@/components/features/media/scroll-container";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getTasteTwins } from "@/server/actions/taste-recs";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { TasteTwinDTO } from "@/lib/taste/recommend-types";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** One suggestion: round avatar, name, "NN% taste match" and up to two shared loves (PUBLIC both sides). */
export function TasteTwinChip({ twin, onOpen }: { twin: TasteTwinDTO; onOpen?: () => void }) {
  return (
    <Link
      href={`/u/${twin.username}`}
      prefetch={false}
      onClick={onOpen}
      className="flex min-h-12 w-[260px] flex-shrink-0 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative flex size-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {twin.avatarUrl ? (
          <Image src={twin.avatarUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
        ) : (
          initials(twin.displayName)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{twin.displayName}</span>
        <span className="block truncate text-xs font-medium text-muted-foreground">
          <span className="tabular-nums text-foreground">{twin.match}%</span> taste match
        </span>
      </span>
      {twin.shared && twin.shared.length > 0 && (
        <span className="flex flex-shrink-0 gap-1" aria-label={`Both loved ${twin.shared.map((t) => t.title).join(" and ")}`}>
          {twin.shared.slice(0, 2).map((t) => (
            <span key={`${t.mediaType}-${t.tmdbId}`} className="relative block h-[42px] w-7 overflow-hidden rounded-md bg-muted">
              {t.posterPath && (
                <Image src={`${TMDB_IMAGE_BASE}/w92${t.posterPath}`} alt="" fill sizes="28px" className="object-cover" unoptimized />
              )}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * Follow suggestions by public taste similarity. Self-hides when empty
 * (private viewer, no public taste profile yet, nobody close enough).
 */
export function TasteTwinsStrip() {
  const { trackAction } = useAnalytics();
  const [twins, setTwins] = useState<TasteTwinDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTasteTwins()
      .then((t) => {
        if (!cancelled) setTwins(t);
      })
      .catch(() => {
        if (!cancelled) setTwins([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!twins || twins.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <SectionHeading icon={<Users className="h-5 w-5 text-brand" />}>Taste twins</SectionHeading>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Members whose public ratings and favourites sit closest to yours.
        </p>
      </div>
      <ScrollContainer gap="gap-3">
        {twins.map((t, position) => (
          <TasteTwinChip
            key={t.username}
            twin={t}
            onOpen={() =>
              trackAction({ action: "taste_twin_click", metadata: { username: t.username, match: t.match, position } })
            }
          />
        ))}
      </ScrollContainer>
    </section>
  );
}
