"use client";

import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";

/** Workstream A's deck, never above the fold → its own chunk, loaded on open. */
const TasteCalibrationDeck = dynamic(
  () => import("@/components/features/home/for-you/calibration-deck").then((m) => m.TasteCalibrationDeck),
  { loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden /> }
);

const TITLE = "Rate 10 titles";
const DESCRIPTION = "Loved it, liked it, not for me, or skip. Each answer counts toward the taste profile.";

/**
 * Hosts the calibration deck (taste v2 spec §4.6 / §4.5 compare-insufficient):
 * Dialog on desktop, Vaul Drawer + Back-to-dismiss on mobile.
 */
export function CalibrationHost({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (r: { positives: number; ready: boolean }) => void;
}) {
  const isMobile = useMobile();
  useHistoryDismiss(open && isMobile, () => onOpenChange(false));
  const deck = open ? <TasteCalibrationDeck mode="start" onComplete={onComplete} /> : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">{deck}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {deck}
      </DialogContent>
    </Dialog>
  );
}
