"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { createList } from "@/server/actions/lists";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired with the new list's slug after a successful create. */
  onCreated?: (list: { slug: string; name: string }) => void;
}

const MAX_NAME = 120;
const MAX_DESC = 2000;

/**
 * Responsive create-list form. Mobile = Vaul Drawer (bottom), desktop = Dialog
 * (DESIGN.md → Dialogs vs Drawers). One shared inner `<CreateListForm/>`.
 */
export function CreateListDialog({ open, onOpenChange, onCreated }: CreateListDialogProps) {
  const isMobile = useMobile();
  useHistoryDismiss(open, () => onOpenChange(false));

  const form = (
    <CreateListForm
      onCancel={() => onOpenChange(false)}
      onCreated={(list) => {
        onOpenChange(false);
        onCreated?.(list);
      }}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>New list</DrawerTitle>
            <DrawerDescription>Group titles however you like.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-1">
            {open ? form : null}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New list</DialogTitle>
          <DialogDescription>Group titles however you like.</DialogDescription>
        </DialogHeader>
        {open ? form : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateListForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (list: { slug: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isRanked, setIsRanked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createList({
        name: trimmedName,
        description: description.trim() ? description.trim() : null,
        isPublic,
        isRanked,
      });
      if (!res.success || !res.list) {
        setError(res.success ? "Could not create list" : res.error);
        return;
      }
      onCreated({ slug: res.list.slug, name: res.list.name });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create list");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="list-name">Name</Label>
        <Input
          id="list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cozy rainy-day watches"
          maxLength={MAX_NAME}
          autoFocus
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="list-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="list-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What ties these together?"
          maxLength={MAX_DESC}
          rows={3}
          disabled={busy}
          className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div className="min-w-0 pr-3">
          <Label htmlFor="list-public" className="cursor-pointer">
            Public list
          </Label>
          <p className="text-xs text-muted-foreground">Visible on your profile and via its link.</p>
        </div>
        <Switch id="list-public" checked={isPublic} onCheckedChange={setIsPublic} disabled={busy} />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div className="min-w-0 pr-3">
          <Label htmlFor="list-ranked" className="cursor-pointer">
            Ranked list
          </Label>
          <p className="text-xs text-muted-foreground">Show numbered positions (1, 2, 3…).</p>
        </div>
        <Switch id="list-ranked" checked={isRanked} onCheckedChange={setIsRanked} disabled={busy} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1.5 h-4 w-4" />
              Create list
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
