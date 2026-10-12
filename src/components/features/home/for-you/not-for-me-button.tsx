"use client";

/**
 * "Not for me" on a recommendation (spec §3.2) — rendered by the rec WRAPPER,
 * never by the card (an action on the recommendation, not on the title).
 * Fine pointers: revealed on wrapper hover / focus-within. Touch (no hover):
 * always visible. Over imagery, so white-on-black is allowed. The visual is
 * 28px; the hit area is 40px.
 */
import { X } from "lucide-react";

export function NotForMeButton({ title, onDismiss }: { title: string; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      aria-label={`Not for me: ${title}`}
      title="Not for me"
      className="absolute left-0 top-0 z-10 flex size-10 items-center justify-center opacity-100 transition-opacity duration-[120ms] focus-visible:opacity-100 focus-visible:outline-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/rec:opacity-100 [@media(hover:hover)]:group-focus-within/rec:opacity-100 group/x"
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white/90 ring-offset-2 transition-colors group-hover/x:bg-black/80 group-focus-visible/x:ring-2 group-focus-visible/x:ring-white">
        <X className="size-4" aria-hidden />
      </span>
    </button>
  );
}
