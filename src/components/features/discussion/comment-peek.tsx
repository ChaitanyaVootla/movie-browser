"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
// next-view-transitions Link: identical API to next/link, but wraps the client
// navigation in document.startViewTransition so the detail→discussions
// shared-element morph (hero-backdrop / hero-logo) fires. Feature-detects:
// browsers without startViewTransition just get a normal navigation.
import { Link } from "next-view-transitions";
import { MessagesSquare, ArrowRight, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import type { CommentPeekDto } from "@/server/db/postgres/comments";

interface Props {
  /** Top public comments (anon tier, already plain-text snippets). Server-fetched. */
  peeks: CommentPeekDto[];
  /** Total published comment count for the "💬 N comments" label. */
  publishedCount: number;
  dedicatedHref: string;
}

const CYCLE_MS = 5000;

function authorHandle(author: CommentPeekDto["author"]): string {
  if (!author) return "former member";
  if (author.username) return `@${author.username}`;
  return author.name ?? "member";
}

function authorInitial(author: CommentPeekDto["author"]): string {
  const src = author?.username ?? author?.name ?? "?";
  return src.charAt(0).toUpperCase();
}

/**
 * Detail-page COMMENT PEEK (spec: lure users into the discussion). A compact,
 * tappable card near the hero that teases the top 1–3 PUBLIC comments
 * (YouTube-mobile "comment teaser" style), auto-cycling through them, then links
 * to the dedicated discussions page.
 *
 * CACHEABLE: all data is server-fetched from the anon tier (no viewer state);
 * this island only animates between the pre-rendered peeks. The author handle is
 * rendered as PLAIN TEXT (not a /u/ link) so the whole card stays a single
 * anchor — no nested <a> in <a> (invariant + valid HTML). Snippets are plain
 * text (markup/spoilers stripped server-side) and rendered as escaped strings.
 */
export function CommentPeek({ peeks, publishedCount, dedicatedHref }: Props) {
  const [index, setIndex] = useState(0);
  const hasPeeks = peeks.length > 0;
  const canCycle = peeks.length > 1;

  useEffect(() => {
    if (!canCycle) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % peeks.length);
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, [canCycle, peeks.length]);

  const countLabel = `${publishedCount.toLocaleString()} ${publishedCount === 1 ? "comment" : "comments"}`;

  // Empty state: no public comments yet — an inviting CTA, no empty peek.
  if (!hasPeeks) {
    return (
      <Link
        href={dedicatedHref}
        data-discussion-strip
        className="group flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 transition-colors hover:border-brand/40 hover:bg-card"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessagesSquare className="h-[18px] w-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">Start the discussion</span>
          <span className="text-xs text-muted-foreground">Be the first to post — spoiler-safe</span>
        </span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand" />
      </Link>
    );
  }

  const active = peeks[index] ?? peeks[0];

  return (
    <Link
      href={dedicatedHref}
      data-discussion-strip
      aria-label={`Join the discussion — ${countLabel}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card/60 transition-colors hover:border-brand/40 hover:bg-card"
    >
      {/* Teaser row — the top comment, swapping on a timer. min-h keeps the card
          height stable so cycling doesn't jank the layout below the hero. */}
      <div className="flex min-h-[3.25rem] items-start gap-3 px-4 pt-3.5">
        <span
          className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-xs font-semibold text-brand"
          style={{ boxShadow: `0 0 0 1.5px ${PROFILE_ACCENT_VARS[active.author?.accent ?? "default"].brand}` }}
        >
          {active.author?.avatarUrl ? (
            <Image
              src={active.author.avatarUrl}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          ) : active.isCue ? (
            <Sparkles className="h-4 w-4" aria-hidden />
          ) : (
            authorInitial(active.author)
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate text-foreground/80">{authorHandle(active.author)}</span>
            {active.isCue ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                AI
              </span>
            ) : null}
            {active.likeCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Heart className="h-3 w-3 fill-current text-brand/70" aria-hidden />
                {active.likeCount}
              </span>
            ) : null}
          </span>
          <span className="line-clamp-2 text-sm leading-snug text-foreground/90">
            {active.snippet}
          </span>
        </span>
      </div>

      {/* Footer CTA — always reads "💬 N comments · Join the discussion →". */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-border/60 bg-background/30 px-4 py-2.5 text-xs font-medium">
        <MessagesSquare className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span className="text-foreground">{countLabel}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-brand">Join the discussion</span>
        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>

      {/* Cycle dots — purely decorative progress for multiple peeks. */}
      {canCycle ? (
        <div className="flex items-center justify-center gap-1.5 pb-2.5" aria-hidden>
          {peeks.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                "h-1 rounded-full transition-all",
                i === index ? "w-4 bg-brand" : "w-1 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      ) : null}
    </Link>
  );
}
