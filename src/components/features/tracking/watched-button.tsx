"use client";

import { Check, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSignInPrompt } from "@/components/features/media/title-actions/sign-in-dialog";
import { useWatchedToggle } from "@/components/features/media/title-actions/use-watched-toggle";
import { WatchedConfirmDialog } from "@/components/features/media/title-actions/watched-confirm-dialog";
import {
  COMPACT_ACTIVE,
  COMPACT_BTN,
  COMPACT_IDLE,
} from "@/components/features/media/title-actions/styles";

interface WatchedButtonProps {
  tmdbId: number;
  title: string;
  /** hero = detail action bar (over imagery, shows ×N); compact = preview/drawer. */
  variant?: "hero" | "compact";
  /** Bump to force a count refetch (e.g. after a change in the separate Diary panel). */
  version?: number;
  /** Notify the parent that watched state/count changed (to refresh peers). */
  onChanged?: () => void;
}

/**
 * The movie "Watched" toggle — one component, one behaviour on every surface
 * (`useWatchedToggle`: confirm-before-unmark when >1 diary entries, toasts,
 * analytics after success, diary pulse + ai-post-watch). Glyph: Eye when not
 * watched, Check when watched (DESIGN.md "eye/check tick").
 *
 * hero fetches the diary count eagerly to show "×N"; compact only fetches it
 * when unmarking, so opening a hover preview costs no server action.
 */
export function WatchedButton({
  tmdbId,
  title,
  variant = "hero",
  version,
  onChanged,
}: WatchedButtonProps) {
  const signIn = useSignInPrompt();
  const w = useWatchedToggle({
    tmdbId,
    title,
    countMode: variant === "hero" ? "eager" : "lazy",
    version,
    onChanged,
    onRequireAuth: () => signIn.prompt("Sign in to track what you watch"),
  });

  const icon = w.updating ? (
    <Loader2 className={cn("animate-spin", variant === "hero" ? "h-3.5 w-3.5" : "h-4 w-4")} />
  ) : w.isWatched ? (
    <Check className={cn("stroke-[2.5]", variant === "hero" ? "h-3.5 w-3.5" : "h-4 w-4")} />
  ) : (
    <Eye className={variant === "hero" ? "h-3.5 w-3.5" : "h-4 w-4"} />
  );

  return (
    <>
      {variant === "hero" ? (
        <button
          type="button"
          onClick={() => void w.request()}
          disabled={w.updating}
          aria-label={w.isWatched ? "Mark as unwatched" : "Mark as watched"}
          aria-pressed={w.isWatched}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold tabular-nums backdrop-blur-sm transition-all",
            w.isWatched
              ? "border-2 border-brand/70 bg-brand/40 text-white shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]"
              : "border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
          )}
        >
          {icon}
          <span className="hidden sm:inline">{w.isWatched ? "Watched" : "Seen it?"}</span>
          {w.watchCount > 1 && <span className="opacity-90">×{w.watchCount}</span>}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void w.request()}
          disabled={w.updating}
          aria-label={w.isWatched ? "Mark as unwatched" : "Mark as watched"}
          aria-pressed={w.isWatched}
          title={w.isWatched ? "Watched" : "Mark as watched"}
          className={cn(COMPACT_BTN, w.isWatched ? COMPACT_ACTIVE : COMPACT_IDLE)}
        >
          {icon}
        </button>
      )}

      <WatchedConfirmDialog
        open={w.confirmOpen}
        onOpenChange={w.setConfirmOpen}
        title={title}
        count={w.confirmCount}
        onConfirm={w.confirm}
      />
      {signIn.dialog}
    </>
  );
}
