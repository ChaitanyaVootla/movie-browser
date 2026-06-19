"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import { IS_IOS } from "@/lib/device";
import { deleteWatchEventAction, updateWatchEventAction } from "@/server/actions/tracking";
import type { DiaryEntryDTO } from "@/types/social";
import { LogWatchForm, type LogWatchFormValues } from "./log-watch-form";

interface DiaryEntryActionsProps {
  entry: DiaryEntryDTO;
}

/** Edit date/note/privacy or delete a diary entry. */
export function DiaryEntryActions({ entry }: DiaryEntryActionsProps) {
  const router = useRouter();
  const isMobile = useMobile();
  const { trackAction } = useAnalytics();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleEdit = async (values: LogWatchFormValues) => {
    setBusy(true);
    try {
      const result = await updateWatchEventAction({
        eventId: entry.id,
        watchedAt: values.watchedAt,
        note: values.note || null,
        score: values.score,
        isPrivate: values.isPrivate,
      });
      if (result.ok) {
        toast.success("Entry updated");
        trackAction({ action: "diary_edit", mediaType: entry.mediaType, itemId: entry.tmdbId });
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const result = await deleteWatchEventAction(entry.id);
      if (result.ok) {
        toast.success("Entry deleted");
        trackAction({ action: "diary_delete", mediaType: entry.mediaType, itemId: entry.tmdbId });
        setConfirmDelete(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setBusy(false);
    }
  };

  const editForm = (
    <LogWatchForm
      defaultValues={{
        watchedAt: entry.watchedAt ? entry.watchedAt.slice(0, 10) : null,
        note: entry.note ?? "",
        score: entry.score,
        isWatch: entry.kind !== "NOTE",
        isPrivate: entry.isPrivate,
      }}
      submitLabel="Save changes"
      busy={busy}
      allowKindToggle={false}
      onSubmit={(values) => void handleEdit(values)}
    />
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Entry actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isMobile ? (
        <Drawer open={editing} onOpenChange={setEditing} repositionInputs={IS_IOS}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg font-semibold line-clamp-1">
                Edit “{entry.title}”
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{editForm}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold line-clamp-1">
                Edit “{entry.title}”
              </DialogTitle>
            </DialogHeader>
            {editForm}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Delete this entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the watch from your diary and recalculates your progress.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
