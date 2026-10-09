"use client";

import { useState } from "react";
import { CalendarPlus, Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { IS_IOS } from "@/lib/device";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useSession } from "next-auth/react";
import { useSignInPrompt } from "@/components/features/media/title-actions/sign-in-dialog";
import { usePreviewHold } from "@/components/features/hover-card/preview-store";
import { COMPACT_BTN, COMPACT_IDLE } from "@/components/features/media/title-actions/styles";
import { useAnalytics } from "@/hooks/use-analytics";
import { logWatchAction } from "@/server/actions/tracking";
import type { TrackedMediaType } from "@/types/social";
import { episodeCode } from "@/lib/tracking-format";
import { useUserStore } from "@/stores/user";
import { emitDiaryUpdated } from "@/hooks/use-diary-pulse";
import { LogWatchForm, type LogWatchFormValues } from "./log-watch-form";

interface QuickLogButtonProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  /** "bar" = detail-page pill (over hero-adjacent chrome); "compact" = hover preview / quick-info drawer icon. */
  variant: "bar" | "compact";
  seasonNumber?: number;
  episodeNumber?: number;
  tmdbEpisodeId?: number;
  className?: string;
  /** Called after a successful log (e.g. provider refresh). */
  onLogged?: () => void;
}

/**
 * Quick-log entry point ("Log to diary", date defaults today).
 * Drawer on mobile, Dialog on desktop (DESIGN.md → Dialogs vs Drawers).
 */
export function QuickLogButton({
  mediaType,
  tmdbId,
  title,
  variant,
  seasonNumber,
  episodeNumber,
  tmdbEpisodeId,
  className,
  onLogged,
}: QuickLogButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isMobile = useMobile();
  const { status } = useSession();
  const signIn = useSignInPrompt();
  const { trackAction } = useAnalytics();
  const markWatchedLocal = useUserStore((s) => s.markWatchedLocal);

  useHistoryDismiss(open, () => setOpen(false));
  usePreviewHold(open);

  // A SERIES-level log is note-only, mirroring the detail DiaryPanel's
  // `forceNote={isSeries}`. A series-level WATCH event is derived as COMPLETED
  // by progress-derive.ts, so one tap from the hover preview would mark a
  // whole series finished. Episode-level logs (season+episode given) stay real
  // watches.
  const noteOnly = mediaType === "series" && seasonNumber === undefined;
  const heading = noteOnly ? "Add a note" : "Log";
  const actionLabel = noteOnly ? "Add a diary note" : "Log to diary";

  const subtitle =
    seasonNumber !== undefined && episodeNumber !== undefined
      ? `${title} ${episodeCode(seasonNumber, episodeNumber)}`
      : title;

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "authenticated") {
      signIn.prompt("Sign in to keep a diary of what you watch");
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async (values: LogWatchFormValues) => {
    const isWatch = values.isWatch && !noteOnly;
    setBusy(true);
    try {
      const result = await logWatchAction({
        mediaType,
        tmdbId,
        seasonNumber,
        episodeNumber,
        tmdbEpisodeId,
        watchedAt: values.watchedAt,
        note: values.note || undefined,
        score: values.score,
        kind: isWatch ? "WATCH" : "NOTE",
        isPrivate: values.isPrivate,
      });
      if (result.ok) {
        toast.success(isWatch ? "Logged to your diary" : "Added a note to your diary");
        trackAction({
          action: "log_watch",
          mediaType,
          itemId: tmdbId,
          itemTitle: title,
          metadata: { seasonNumber, episodeNumber, note: !isWatch },
        });
        // A WATCH entry marks the movie watched server-side, so mirror it in the
        // store (preview/cards update) and pulse any Diary opener on the page.
        if (isWatch && mediaType === "movie") markWatchedLocal(tmdbId);
        emitDiaryUpdated(mediaType, tmdbId);
        setOpen(false);
        onLogged?.();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to log — try again");
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <LogWatchForm
      submitLabel={noteOnly ? "Add note" : "Log to diary"}
      forceNote={noteOnly}
      busy={busy}
      onSubmit={(values) => void handleSubmit(values)}
    />
  );

  return (
    <>
      {variant === "bar" ? (
        <Button
          size="sm"
          variant="secondary"
          className={cn(
            "gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white backdrop-blur-sm transition-all",
            className
          )}
          onClick={handleOpen}
          aria-label={actionLabel}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5" />
          )}
          <span className="text-[13px] font-semibold">Log</span>
        </Button>
      ) : (
        <button
          type="button"
          className={cn(COMPACT_BTN, COMPACT_IDLE, className)}
          onClick={handleOpen}
          aria-label={actionLabel}
          title={actionLabel}
        >
          <NotebookPen className="h-4 w-4" />
        </button>
      )}

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} repositionInputs={IS_IOS}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold line-clamp-1">
                {heading} “{subtitle}”
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{form}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold line-clamp-1">
                {heading} “{subtitle}”
              </DialogTitle>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      )}
      {signIn.dialog}
    </>
  );
}
