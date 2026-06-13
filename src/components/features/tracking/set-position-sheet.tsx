"use client";

import { useMemo, useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import type { SeasonSelectorSeason } from "@/types/client-props";
import { useSeriesTracking } from "./series-tracking-provider";

interface SetPositionSheetProps {
  seriesId: number;
  seasons: SeasonSelectorSeason[];
  /** Custom trigger label, e.g. "Set my position" or "Start tracking". */
  triggerLabel?: string;
}

/**
 * "Caught up through SxEy" picker — one tap backfills everything up to the
 * chosen episode (source=BACKFILL on the server).
 */
export function SetPositionSheet({ seriesId, seasons, triggerLabel = "Set my position" }: SetPositionSheetProps) {
  const tracking = useSeriesTracking();
  const isMobile = useMobile();
  const { trackAction } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const regularSeasons = useMemo(() => seasons.filter((s) => s.season_number > 0), [seasons]);
  const [seasonNumber, setSeasonNumber] = useState<number>(
    regularSeasons[0]?.season_number ?? 1
  );
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);

  if (!tracking || !tracking.isAuthenticated || regularSeasons.length === 0) return null;

  const selectedSeason = regularSeasons.find((s) => s.season_number === seasonNumber);
  const episodeOptions = Array.from(
    { length: Math.max(selectedSeason?.episode_count ?? 1, 1) },
    (_, i) => i + 1
  );

  const handleSave = async () => {
    setBusy(true);
    const ok = await tracking.setPosition(seasonNumber, episodeNumber);
    setBusy(false);
    if (ok) {
      trackAction({
        action: "set_position",
        mediaType: "series",
        itemId: seriesId,
        metadata: { seasonNumber, episodeNumber },
      });
      setOpen(false);
    }
  };

  const body = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Everything up to and including this episode will be marked watched.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Season</Label>
          <Select
            value={String(seasonNumber)}
            onValueChange={(v) => {
              setSeasonNumber(parseInt(v, 10));
              setEpisodeNumber(1);
            }}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-[min(60dvh,var(--radix-select-content-available-height))]">
              {regularSeasons.map((s) => (
                <SelectItem key={s.id} value={String(s.season_number)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Episode</Label>
          <Select value={String(episodeNumber)} onValueChange={(v) => setEpisodeNumber(parseInt(v, 10))}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-[min(60dvh,var(--radix-select-content-available-height))]">
              {episodeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Episode {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="w-full h-10" disabled={busy} onClick={() => void handleSave()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Caught up through S${seasonNumber}E${episodeNumber}`}
      </Button>
    </div>
  );

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 h-9 text-muted-foreground hover:text-foreground"
      onClick={() => setOpen(true)}
    >
      <LocateFixed className="h-3.5 w-3.5" />
      {triggerLabel}
    </Button>
  );

  return (
    <>
      {trigger}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold">Set my position</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{body}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Set my position</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
