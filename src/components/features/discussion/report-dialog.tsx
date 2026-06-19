"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportComment } from "@/server/actions/comments";
import { useAnalytics } from "@/hooks/use-analytics";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";

const REASONS = [
  { value: "SPOILER", label: "Untagged spoiler" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE_SPEECH", label: "Hate speech" },
  { value: "SPAM", label: "Spam or advertising" },
  { value: "OTHER", label: "Something else" },
] as const;

type ReasonValue = (typeof REASONS)[number]["value"];

export function ReportDialog({
  commentId,
  open,
  onOpenChange,
}: {
  commentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { trackAction } = useAnalytics();
  const isMobile = useMobile();
  const [reason, setReason] = useState<ReasonValue>("SPOILER");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useHistoryDismiss(open, () => onOpenChange(false));

  const submit = async () => {
    setSubmitting(true);
    const result = await reportComment({ commentId, reason, note: note || undefined });
    setSubmitting(false);
    if (result.ok) {
      trackAction({ action: "comment_report", itemId: commentId, metadata: { reason } });
      toast.success("Report submitted. Thanks for keeping threads safe.");
      onOpenChange(false);
      setNote("");
    } else {
      toast.error(result.message);
    }
  };

  const fields = (
    <div className="space-y-3">
      <Select value={reason} onValueChange={(v) => setReason(v as ReasonValue)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REASONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Anything the moderators should know (optional)"
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
    </div>
  );

  const actions = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={() => void submit()} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit report"}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <DrawerHeader className="px-0">
            <DrawerTitle>Report comment</DrawerTitle>
          </DrawerHeader>
          {fields}
          <DrawerFooter className="flex-row justify-end gap-2 px-0">{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report comment</DialogTitle>
        </DialogHeader>
        {fields}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
