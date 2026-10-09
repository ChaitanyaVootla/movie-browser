"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import { getTasteMatch } from "@/server/actions/taste-recs";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { getMediaPath } from "@/lib/utils";
import type { TasteMatchDTO, TasteMatchTitleDTO } from "@/lib/taste/recommend-types";
import { useProfileViewer } from "./profile-viewer-context";

/** 1–10 score → "4.5" stars; null (heart only) → null. */
function stars(score: number | null): string | null {
  if (score == null) return null;
  const s = score / 2;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

function Meter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-foreground">{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Poster({ t }: { t: TasteMatchTitleDTO }) {
  const src = t.posterPath ? `${TMDB_IMAGE_BASE}/w185${t.posterPath}` : null;
  return (
    <Link
      href={getMediaPath(t.mediaType, t.id, t.title)}
      prefetch={false}
      className="group block w-[72px] flex-shrink-0 sm:w-20"
      title={t.title}
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        {src ? (
          <Image src={src} alt={t.title} fill sizes="80px" className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
            {t.title}
          </span>
        )}
      </span>
    </Link>
  );
}

function ScorePair({ who, score }: { who: string; score: number | null }) {
  const s = stars(score);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="text-muted-foreground">{who}</span>
      <Star className="h-3 w-3 fill-current text-brand" aria-hidden />
      <span className="text-foreground">{s ?? "—"}</span>
    </span>
  );
}

/**
 * Viewer ↔ profile-owner taste match, in the profile's reserved slot.
 * ISR-safe client island: nothing renders until the viewer resolves as a
 * signed-in non-owner AND the server action allows it (block/mute, privacy
 * and showTaste gates are server-side; PUBLIC-scope data only).
 */
export function TasteMatch({ username, displayName }: { username: string; displayName: string }) {
  const { resolved, authenticated, isOwner } = useProfileViewer();
  const { trackAction } = useAnalytics();
  const [match, setMatch] = useState<TasteMatchDTO | null>(null);

  const eligible = resolved && authenticated && !isOwner;

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    getTasteMatch(username)
      .then((m) => {
        if (cancelled) return;
        setMatch(m);
        if (m) trackAction({ action: "taste_match_view", metadata: { username, score: m.score } });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible, username, trackAction]);

  if (!eligible || !match) return null;

  const firstName = displayName.split(/\s+/)[0] || displayName;
  const basis =
    match.evidence.sharedRated > 0
      ? `Based on ${match.evidence.sharedRated} ${match.evidence.sharedRated === 1 ? "title" : "titles"} you both rated`
      : "Based on your public favourites and ratings";

  return (
    <section aria-labelledby="taste-match-heading" className="rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <div className="md:w-56 md:flex-shrink-0">
          <h2 id="taste-match-heading" className="text-sm font-semibold">
            Your taste match with {firstName}
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{match.score}%</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{basis}</p>
          <div className="mt-4 space-y-3">
            <Meter label="Ratings agree" value={match.components.scoreSim} />
            <Meter label="Shared loves" value={match.components.likedSim} />
            <Meter label="Overall taste" value={match.components.tasteSim} />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {match.sharedFavorites.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">You both loved</h3>
              <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide">
                {match.sharedFavorites.map((t) => (
                  <Poster key={`${t.mediaType}-${t.id}`} t={t} />
                ))}
              </div>
            </div>
          )}
          {match.fightAbout.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">You&apos;d argue about</h3>
              <ul className="mt-2 divide-y">
                {match.fightAbout.map((t) => (
                  <li key={`${t.mediaType}-${t.id}`} className="flex min-h-12 items-center gap-3 py-2">
                    <Link
                      href={getMediaPath(t.mediaType, t.id, t.title)}
                      prefetch={false}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline underline-offset-4"
                    >
                      {t.title}
                    </Link>
                    <span className="flex flex-shrink-0 items-center gap-3 text-xs font-medium">
                      <ScorePair who="You" score={t.viewerScore} />
                      <ScorePair who={firstName} score={t.ownerScore} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {match.sharedFavorites.length === 0 && match.fightAbout.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No titles in common yet. Rate a few of {firstName}&apos;s favourites to sharpen this.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
