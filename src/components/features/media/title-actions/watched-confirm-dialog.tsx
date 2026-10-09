"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { usePreviewHold } from "@/components/features/hover-card/preview-store";

interface WatchedConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Diary entries that will be removed; null = unknown. */
  count: number | null;
  onConfirm: () => void;
}

/**
 * "Remove from watched?" — shown before an unmark that would delete more than
 * one diary entry (or an unknown number). Dialog on desktop, Vaul Drawer on
 * mobile (DESIGN.md → Dialogs vs Drawers), Back-dismissable, and it holds the
 * hover preview open while showing.
 */
export function WatchedConfirmDialog({
  open,
  onOpenChange,
  title,
  count,
  onConfirm,
}: WatchedConfirmDialogProps) {
  const isMobile = useMobile();
  useHistoryDismiss(open, () => onOpenChange(false));
  usePreviewHold(open);

  const heading = "Remove from watched?";
  const body =
    count === null
      ? `Marking “${title}” unwatched removes its diary entries. To keep your history, manage entries in the diary instead.`
      : `You have ${count} diary entries for “${title}”. Marking it unwatched removes all of them. To keep your history, manage entries in the diary instead.`;

  const actions = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onConfirm}>
        Remove all
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg font-semibold">{heading}</DrawerTitle>
            <DrawerDescription>{body}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex-row justify-end pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            {actions}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{heading}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
