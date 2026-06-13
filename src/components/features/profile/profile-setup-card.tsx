"use client";

import Link from "next/link";
import {
  ChevronRight,
  Clapperboard,
  Image as ImageIcon,
  MessageSquareQuote,
  PenLine,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useProfileViewer } from "./profile-viewer-context";

/**
 * Owner-only "finish your profile" nudge — the engagement driver for a sparse
 * profile. It turns the empty state into an inviting, gamified checklist
 * instead of a collapsed void.
 *
 * ISR-safe: the profile page is edge-cached with NO viewer data. This reads
 * the shared ProfileViewer context (resolved client-side after hydration) and
 * renders NOTHING until it knows the viewer is the owner — so a visitor's cache
 * hit never contains it, and a visitor never sees it. The completeness flags
 * come from the (cacheable, viewer-agnostic) profile data, so they leak nothing.
 */

interface SetupFlags {
  hasBackdrop: boolean;
  hasFourFavorites: boolean;
  hasBio: boolean;
  hasLogged: boolean;
  hasReview: boolean;
}

interface Step {
  key: string;
  done: boolean;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
}

export function ProfileSetupCard({ flags }: { flags: SetupFlags }) {
  const { resolved, isOwner } = useProfileViewer();

  const steps: Step[] = [
    { key: "backdrop", done: flags.hasBackdrop, label: "Add a backdrop", sub: "Cinematic art for your header", href: "/settings", icon: ImageIcon },
    { key: "favorites", done: flags.hasFourFavorites, label: "Choose Four Favorites", sub: "The films that define you", href: "/settings#four-favorites", icon: Star },
    { key: "bio", done: flags.hasBio, label: "Write a bio", sub: "Say what you're into", href: "/settings", icon: PenLine },
    { key: "log", done: flags.hasLogged, label: "Log your first watch", sub: "Start your diary & stats", href: "/", icon: Clapperboard },
    { key: "review", done: flags.hasReview, label: "Write a review", sub: "Share your take on a title", href: "/", icon: MessageSquareQuote },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const remaining = steps.filter((s) => !s.done);

  // Not the owner (or not yet resolved), or profile already complete → render nothing.
  if (!resolved || !isOwner || remaining.length === 0) return null;

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b border-border/60 bg-gradient-to-br from-brand/10 to-transparent p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold">Finish your profile</h2>
          <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {remaining.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            prefetch={false}
            className="group flex items-center gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-brand/40 hover:bg-brand/5"
          >
            <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <step.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{step.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{step.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        ))}
      </div>
    </section>
  );
}
