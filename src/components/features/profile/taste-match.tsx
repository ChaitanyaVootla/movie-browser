"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, Star } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import { getTasteMatch } from "@/server/actions/taste-recs";
import { CueEntryButton } from "@/components/features/ai/cue-entry";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { cn, getMediaPath } from "@/lib/utils";
import type { TasteMatchDTO, TasteMatchTitleDTO } from "@/lib/taste/recommend-types";
import { useProfileViewer } from "./profile-viewer-context";
import { FollowButton } from "./follow-button";
import { matchSegments, type MatchComponentKey } from "./taste/match-segments";
import { TASTE_COMPARE_EVENT } from "./taste/compare-overlay";
import { TASTE_CARD_ID } from "./taste/taste-data";

/** 1–10 score → "4.5" stars; null (heart only) → null. */
function stars(score: number | null): string | null {
  if (score == null) return null;
  const s = score / 2;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

/**
 * Brand steps for the three contributions (one accent, three lightness steps).
 * /70 vs /40 were indistinguishable on the dark canvas; the steps are wider and
 * the segments are split by a card-coloured hairline.
 */
const SEGMENT_FILL: Record<MatchComponentKey, string> = {
  scoreSim: "bg-brand",
  likedSim: "bg-brand/60",
  tasteSim: "bg-brand/25",
};

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

/** "7 titles both rated · 6 shared loves · favourites 28% alike" — numbers only. */
function evidenceLine(match: TasteMatchDTO): string {
  const parts: string[] = [];
  const { sharedRated, sharedLiked } = match.evidence;
  if (sharedRated > 0)
    parts.push(`${sharedRated} ${sharedRated === 1 ? "title" : "titles"} both rated`);
  if (sharedLiked > 0) parts.push(`${sharedLiked} shared ${sharedLiked === 1 ? "love" : "loves"}`);
  if (match.components.tasteSim !== null)
    parts.push(`favourites ${Math.round(match.components.tasteSim * 100)}% alike`);
  return parts.length > 0 ? parts.join(" · ") : "Based on public favourites and ratings";
}

/** One h-2 bar filled to the headline, segmented by each component's weighted share. */
function MatchBar({ match }: { match: TasteMatchDTO }) {
  const [detail, setDetail] = useState(false);
  const segments = matchSegments(match.components);
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Taste match"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={match.score}
      >
        {segments.map((s) => (
          <span
            key={s.key}
            className={cn("h-full [&+&]:border-l-2 [&+&]:border-card", SEGMENT_FILL[s.key])}
            style={{ width: `${s.width}%` }}
            title={`${s.label}: ${s.value}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        {segments.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5"
            title={`${s.label}: ${s.value}%`}
          >
            <span aria-hidden className={cn("size-2 rounded-full", SEGMENT_FILL[s.key])} />
            {s.label}
          </span>
        ))}
        <button
          type="button"
          aria-expanded={detail}
          onClick={() => setDetail((d) => !d)}
          className="inline-flex min-h-10 items-center text-foreground underline-offset-4 hover:underline md:min-h-0"
        >
          {detail ? "Hide the numbers" : "How it adds up"}
        </button>
      </div>
      {detail && (
        <p className="mt-1 text-xs font-medium tabular-nums text-muted-foreground">
          {segments.map((s) => `${s.label} ${s.value}%`).join(" · ")}. Weighted, they make{" "}
          {match.score}%.
        </p>
      )}
    </div>
  );
}

/**
 * Viewer ↔ profile-owner taste match (taste v2 spec §4.9): the first thing a
 * signed-in visitor sees under the hero. ISR-safe client island: nothing
 * renders until the viewer resolves as a signed-in non-owner AND the server
 * gate allows it (block/mute, privacy, showTaste; PUBLIC-scope data only).
 */
export function TasteMatch({ username, displayName }: { username: string; displayName: string }) {
  const { resolved, authenticated, isOwner } = useProfileViewer();
  const { trackAction } = useAnalytics();
  const [match, setMatch] = useState<TasteMatchDTO | null>(null);
  // One view event per target: trackAction's identity changes when the session
  // settles, which used to re-run the fetch effect and double-fire the event.
  const trackedFor = useRef<string | null>(null);

  const eligible = resolved && authenticated && !isOwner;

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    getTasteMatch(username)
      .then((m) => {
        if (cancelled) return;
        setMatch(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible, username]);

  useEffect(() => {
    if (!match || trackedFor.current === username) return;
    trackedFor.current = username;
    trackAction({ action: "taste_match_view", metadata: { username, score: match.score } });
  }, [match, username, trackAction]);

  if (!eligible || !match) return null;

  const firstName = displayName.split(/\s+/)[0] || displayName;
  const hasCard =
    typeof document !== "undefined" && document.getElementById(TASTE_CARD_ID) !== null;
  const compareOnStrand = () => {
    window.dispatchEvent(new CustomEvent(TASTE_COMPARE_EVENT));
    document.getElementById(TASTE_CARD_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section aria-labelledby="taste-match-heading" className="rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <div className="md:w-72 md:flex-shrink-0">
          <h2 id="taste-match-heading" className="text-sm font-semibold">
            Your taste match with {firstName}
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
            {match.score}%
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{evidenceLine(match)}</p>
          <div className="mt-4">
            <MatchBar match={match} />
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
                  <li
                    key={`${t.mediaType}-${t.id}`}
                    className="flex min-h-12 items-center gap-3 py-2"
                  >
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
          {/* Actions sit in the right column: the left column (score + bar) is
              the taller one, so a full-width footer left the right half empty. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <FollowButton username={username} variant="card" className="w-full sm:w-auto" />
            <CueEntryButton
              entry="match_card"
              variant="pill"
              label="Find something for both of us"
              message={`Find something ${firstName} and I would both enjoy tonight`}
              className="w-full justify-center sm:w-auto"
            />
            {hasCard && (
              <button
                type="button"
                onClick={compareOnStrand}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
              >
                Compare on the strand
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
