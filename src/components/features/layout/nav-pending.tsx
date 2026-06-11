"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Navigation pending indicators (DESIGN.md → Components → "Navigation pending").
 *
 * Server renders can take seconds on cold pages, and card links use
 * `prefetch={false}` (the 2-vCPU box can't absorb viewport prefetch storms), so
 * clicking a card needs an immediate "something is happening" signal.
 *
 * Both components must be rendered as a DESCENDANT of the `<Link>` they report
 * on — `useLinkStatus` reads the nearest Link's status context. They appear
 * ~150ms after the navigation starts (CSS animation delay via `.nav-pending-in`
 * in globals.css) so fast/cached navigations never flash a spinner.
 */

/**
 * Dim + spinner overlay for poster/backdrop card links.
 * Place inside the card's `relative` image container.
 * Colors are hardcoded white/black because it always sits over imagery
 * (DESIGN.md "content over imagery" exception).
 */
export function CardPendingOverlay({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <div
      data-nav-pending
      aria-hidden="true"
      className={cn(
        "nav-pending-in absolute inset-0 z-20 grid place-items-center bg-black/50",
        className
      )}
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-brand" />
    </div>
  );
}

/**
 * Small inline spinner for text/button links (e.g. "View Details").
 * Renders nothing when idle so layout is unchanged.
 */
export function InlinePendingSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      data-nav-pending
      aria-hidden="true"
      className={cn(
        "nav-pending-in inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current align-middle",
        className
      )}
    />
  );
}
