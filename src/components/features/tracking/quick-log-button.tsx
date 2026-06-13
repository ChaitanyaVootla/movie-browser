"use client";

import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { IS_IOS } from "@/lib/device";
import { useMobile } from "@/hooks/use-mobile";
import { useSession } from "next-auth/react";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { logWatchAction } from "@/server/actions/tracking";
import type { TrackedMediaType } from "@/types/social";
import { episodeCode } from "@/lib/tracking-format";
import { LogWatchForm, type LogWatchFormValues } from "./log-watch-form";

interface QuickLogButtonProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  /** "bar" = detail-page pill (over hero-adjacent chrome); "card" = poster overlay icon. */
  variant: "bar" | "card";
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
  const { openLoginDialog } = useLoginDialog();
  const { trackAction } = useAnalytics();

  const subtitle =
    seasonNumber !== undefined && episodeNumber !== undefined
      ? `${title} ${episodeCode(seasonNumber, episodeNumber)}`
      : title;

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "authenticated") {
      openLoginDialog();
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async (values: LogWatchFormValues) => {
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
        isRewatch: values.isRewatch,
        isPrivate: values.isPrivate,
      });
      if (result.ok) {
        toast.success("Logged to your diary");
        trackAction({
          action: "log_watch",
          mediaType,
          itemId: tmdbId,
          itemTitle: title,
          metadata: { seasonNumber, episodeNumber, rewatch: values.isRewatch },
        });
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
      submitLabel="Log to diary"
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
          aria-label="Log to diary"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5" />
          )}
          <span className="text-[13px] font-semibold">Log</span>
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "h-8 w-8 bg-black/70 hover:bg-black/90 border border-white/20",
            className
          )}
          onClick={handleOpen}
          aria-label="Log to diary"
        >
          <CalendarPlus className="h-4 w-4" />
        </Button>
      )}

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} repositionInputs={IS_IOS}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold line-clamp-1">
                Log “{subtitle}”
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
                Log “{subtitle}”
              </DialogTitle>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
