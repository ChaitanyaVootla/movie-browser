"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Star,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Share2,
  NotebookPen,
  MessagesSquare,
  ArrowRight,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RatingsBar } from "@/components/features/media/ratings-bar";
import type { ExternalRating } from "@/types";
import { TITLES, backdrop, logo, formatCount, type MockTitle } from "../_lib/mock";
import { DiscussionPip, FriendsActive, ProgressBar, MiniRing, PartialStar, Play, pct } from "./signals";

/* ------------------------------------------------------------------ */
/* Wide card — footer line. Title BELOW the card (no in-card title).   */
/* ------------------------------------------------------------------ */

function WideCard({ t }: { t: MockTitle }) {
  const p = t.progress;
  const inProgress = t.type === "series" && !!p && p.watched < p.total;
  const subline = inProgress && p?.upNext ? `Up next · ${p.upNext}` : String(t.year);
  return (
    <div className="group w-[300px] shrink-0">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdrop(t)} alt={t.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-3">
          <DiscussionPip count={formatCount(t.discussions)} label />
          <FriendsActive n={t.friendsActive} />
        </div>
        {inProgress && p && <ProgressBar percent={pct(p)} />}
      </div>
      <h3 className="mt-2 line-clamp-1 text-sm font-medium leading-tight group-hover:text-brand">{t.title}</h3>
      <p className="text-[11px] text-muted-foreground">{subline}</p>
    </div>
  );
}

export function WideRow() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TITLES.map((t) => (
        <WideCard key={t.id} t={t} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — faithful (non-cropping right-aligned backdrop, real ratings)  */
/* + correct action bar + the Community teaser row.                     */
/* ------------------------------------------------------------------ */

const RATINGS: ExternalRating[] = [
  { name: "IMDb", rating: "86" },
  { name: "Rotten Tomatoes", rating: "96", certified: true },
  { name: "RT Audience", rating: "89" },
  { name: "Google", rating: "94" },
];

const PROVIDER_LOGOS = [
  { name: "Netflix", src: "/images/ott/netflix.svg" },
  { name: "Prime Video", src: "/images/ott/prime.svg" },
  { name: "Hotstar", src: "/images/ott/hotstar.svg" },
  { name: "Apple TV", src: "/images/ott/apple.png" },
];

const LEFT_GRADIENT =
  "linear-gradient(to right, rgb(var(--hero-base-rgb)) 0%, rgb(var(--hero-base-rgb) / 0.9) 3%, rgb(var(--hero-base-rgb) / 0.7) 8%, rgb(var(--hero-base-rgb) / 0.4) 15%, rgb(var(--hero-base-rgb) / 0.15) 25%, transparent 35%)";

/* --- real action-bar buttons (white-on-dark, like MediaActions hero variant) --- */
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[13px] font-semibold text-white/85 backdrop-blur-sm transition hover:bg-white/20 hover:text-white";
const ICON_BTN = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/75 backdrop-blur-sm transition hover:bg-white/20 hover:text-white";

function ActionBar() {
  const t = TITLES.find((x) => x.id === 100088)!;
  const p = t.progress!;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-4 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/25">
        <Play className="h-3.5 w-3.5 fill-current" /> Trailer
      </button>
      <button className={BTN}>
        <Plus className="h-3.5 w-3.5" /> Watchlist
      </button>
      {/* series: progress IS the watch control (movie would be the segmented Watched button) */}
      <button className={BTN}>
        <MiniRing percent={pct(p)} /> Up next · {p.upNext}
      </button>
      <button className={ICON_BTN} aria-label="Like">
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button className={ICON_BTN} aria-label="Dislike">
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <button className={ICON_BTN} aria-label="Share">
        <Share2 className="h-3.5 w-3.5" />
      </button>
      <button className={BTN}>
        <Star className="h-3.5 w-3.5 fill-[var(--sig)] text-[var(--sig)]" /> 4.5
      </button>
      <button className={BTN}>
        <NotebookPen className="h-3.5 w-3.5" /> Diary
      </button>
    </div>
  );
}

/* --- faithful CommentPeek replica (the prominent discussion box) --- */
const DISCUSSION_PEEKS = [
  { handle: "@cinephile_ada", likes: 42, text: "Episode 3 broke me. The way they let the whole hour breathe instead of rushing to the next set-piece — nobody else on TV is doing this." },
  { handle: "@binge_bea", likes: 28, text: "Pedro and Bella's chemistry carries the whole apocalypse. The cordyceps stuff is almost secondary to the relationship." },
  { handle: "@critic_cy", likes: 17, text: "Faithful to the game where it matters, brave where it doesn't. The bottle episode is an instant classic." },
];

function PeekShell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 transition-colors hover:border-brand/40 hover:bg-card">
      <div className="flex-1">{children}</div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-border/60 bg-background/30 px-4 py-2.5 text-xs font-medium">
        {footer}
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </div>
  );
}

function DiscussionPeek() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const tmr = setInterval(() => setI((x) => (x + 1) % DISCUSSION_PEEKS.length), 5000);
    return () => clearInterval(tmr);
  }, []);
  const a = DISCUSSION_PEEKS[i];
  return (
    <PeekShell
      footer={
        <>
          <MessagesSquare className="h-4 w-4 shrink-0 text-brand" />
          <span className="text-foreground">1,240 comments</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-brand">Join the discussion</span>
        </>
      }
    >
      <div className="flex min-h-[3.25rem] items-start gap-3 px-4 pt-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
          {a.handle.charAt(1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate text-foreground/80">{a.handle}</span>
            <span className="inline-flex items-center gap-0.5">
              <Heart className="h-3 w-3 fill-current text-brand/70" />
              {a.likes}
            </span>
          </span>
          <span className="line-clamp-2 text-sm leading-snug text-foreground/90">{a.text}</span>
        </span>
      </div>
      <div className="flex items-center justify-center gap-1.5 pb-2.5 pt-2">
        {DISCUSSION_PEEKS.map((_, x) => (
          <span key={x} className={cn("h-1 rounded-full transition-all", x === i ? "w-4 bg-brand" : "w-1 bg-muted-foreground/30")} />
        ))}
      </div>
    </PeekShell>
  );
}

/* --- Reviews & Ratings peek (MERGED): same opinion axis, two fidelities.
   Ratings = the quantitative signal (histogram, ~2.1K). Reviews = the written
   subset (~388). Distribution is the HEADER; the top review cycles below; the
   COUNT lives in the footer (avg is shown once, not repeated). --- */
const REVIEW_PEEKS = [
  { handle: "@critic_cy", stars: 4.5, loved: true, text: "A near-perfect adaptation that understands the source is about people, not spores. The restraint is the whole point." },
  { handle: "@cinephile_ada", stars: 5, loved: true, text: "The best video-game adaptation ever made, and it's not close. Television as grief, rendered with extraordinary patience." },
];
const HISTO = [3, 5, 8, 12, 18, 26, 34, 40, 30, 16]; // 1..10 rating buckets

function ReviewsRatingsPeek() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const tmr = setInterval(() => setI((x) => (x + 1) % REVIEW_PEEKS.length), 5500);
    return () => clearInterval(tmr);
  }, []);
  const a = REVIEW_PEEKS[i];
  const max = Math.max(...HISTO);
  return (
    <PeekShell
      footer={
        <>
          <Star className="h-4 w-4 shrink-0 fill-brand text-brand" />
          <span className="text-foreground">2.1K ratings</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-foreground">388 reviews</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-brand">Read &amp; rate</span>
        </>
      }
    >
      {/* rating distribution = header (the quantitative signal) */}
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <div className="flex flex-col">
          <span className="text-2xl font-bold leading-none text-foreground">8.6</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            you <PartialStar value={4.5} /> <span className="font-semibold text-foreground/80">4.5</span>
          </span>
        </div>
        <div className="flex h-9 flex-1 items-end gap-[3px]">
          {HISTO.map((v, x) => (
            // community data viz → TRUE brand crimson (not the dulled personal --sig)
            <span key={x} className="flex-1 rounded-sm bg-brand" style={{ height: `${(v / max) * 100}%` }} />
          ))}
        </div>
      </div>

      <div className="mx-4 my-2.5 border-t border-border/60" />

      {/* top review = the written subset, cycling */}
      <div className="flex min-h-[3rem] items-start gap-3 px-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
          {a.handle.charAt(1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate text-foreground/80">{a.handle}</span>
            <span className="inline-flex items-center gap-0.5">
              <PartialStar value={a.stars} />
              <span className="text-foreground/80">{a.stars}</span>
            </span>
            {a.loved && <Heart className="h-3 w-3 fill-[var(--sig)] text-[var(--sig)]" />}
          </span>
          <span className="line-clamp-2 text-sm leading-snug text-foreground/90">{a.text}</span>
        </span>
      </div>
      <div className="flex items-center justify-center gap-1.5 pb-2.5 pt-2">
        {REVIEW_PEEKS.map((_, x) => (
          <span key={x} className={cn("h-1 rounded-full transition-all", x === i ? "w-4 bg-brand" : "w-1 bg-muted-foreground/30")} />
        ))}
      </div>
    </PeekShell>
  );
}

export function HeroMock({ bleed }: { bleed?: boolean }) {
  const t = TITLES.find((x) => x.id === 100088)!; // The Last of Us
  const PADX = bleed ? "px-5 md:px-10 lg:px-12" : "px-5 md:px-8";

  return (
    <div className="w-full">
      {/* HERO — real height clamp + non-cropping right-aligned backdrop */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-hero-base",
          "h-[clamp(300px,52vh,480px)] md:h-[clamp(400px,60vh,750px)]",
          bleed ? "" : "rounded-2xl"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdrop(t)} alt={t.title} className="absolute inset-0 h-full w-full object-cover object-[center_20%] md:hidden" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[rgb(var(--hero-base-rgb))] via-[rgb(var(--hero-base-rgb)/0.6)] to-transparent md:hidden" />

        <div className="absolute inset-0 hidden justify-end md:flex">
          <div className="relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdrop(t)} alt={t.title} className="h-full w-auto max-w-none" />
            <div className="pointer-events-none absolute inset-0" style={{ background: LEFT_GRADIENT }} />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 hidden h-[12%] bg-gradient-to-t from-background/70 to-transparent md:block" />

        <div className={cn("absolute inset-x-0 bottom-6 md:bottom-9", PADX)}>
          <div className="w-full md:w-[clamp(280px,30vw,480px)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo(t)} alt={t.title} className="mb-3 max-h-16 w-auto max-w-[60%] object-contain drop-shadow-lg md:mb-5 md:max-h-[150px] md:max-w-full" />
            <blockquote className="mb-3 border-l-2 border-brand/50 pl-3 text-xs italic leading-relaxed text-white/90 md:text-sm">
              A brutal, tender road through the end of the world — the year&apos;s most-talked-about adaptation.
            </blockquote>
            <div className="mb-3">
              <RatingsBar ratings={RATINGS} size="md" />
            </div>
            <div className="flex">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 py-1.5 pl-2.5 pr-3 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 border-r border-white/10 pr-1.5 text-white/80">
                  <Play className="h-3 w-3 fill-current" />
                  <span className="text-[11px] font-medium">Watch</span>
                  <span className="text-[10px] text-white/50">(IN)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {PROVIDER_LOGOS.map((pr) => (
                    <span key={pr.name} className="relative h-7 w-7 overflow-hidden rounded bg-black/20" title={pr.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pr.src} alt={pr.name} className="h-full w-full object-contain p-0.5" />
                    </span>
                  ))}
                  <ExternalLink className="ml-0.5 h-4 w-4 text-white/50" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BELOW HERO — action bar (real buttons) */}
      <div className={cn("pt-5", PADX)}>
        <ActionBar />
      </div>

      {/* COMMUNITY TEASER ROW — discussion box (faithful) + reviews + ratings,
          all elevated to the same prominence right under the hero. Each is the
          ENTRY into its tab in the full band below (no duplication). */}
      <div className={cn("grid gap-3 pt-5 md:grid-cols-2", PADX)}>
        <DiscussionPeek />
        <ReviewsRatingsPeek />
      </div>

      {/* ghost of the full Community band (Phase B) below */}
      <div className={cn("py-8", PADX)}>
        <div className="mb-3 flex items-center gap-4 text-sm font-semibold text-muted-foreground">
          <span className="border-b-2 border-brand pb-1 text-foreground">Discussion</span>
          <span>Reviews &amp; Ratings</span>
        </div>
        <div className="space-y-2 opacity-35">
          <div className="h-3 w-2/3 rounded bg-foreground/15" />
          <div className="h-3 w-1/2 rounded bg-foreground/15" />
          <div className="h-3 w-3/5 rounded bg-foreground/15" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          ↓ the full Community band (Phase B) lives here. The two teaser boxes above are the at-a-glance entries into
          its tabs — discussion stays as prominent as today, and Reviews &amp; Ratings (one axis: the histogram is the
          quantitative signal, reviews the written subset) is promoted to the same level.
        </p>
      </div>
    </div>
  );
}
