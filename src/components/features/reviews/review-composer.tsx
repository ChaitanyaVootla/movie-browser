"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import { IS_IOS } from "@/lib/device";
import { submitReviewAction } from "@/server/actions/reviews";
import type { OwnReviewDTO, TrackedMediaType } from "@/types/social";

interface ReviewComposerProps {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  seasonNumber?: number;
  existing: OwnReviewDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (review: OwnReviewDTO) => void;
}

const MAX_LENGTH = 10000;

/** Compose/edit a review: public/private + containsSpoilers. */
export function ReviewComposer({
  mediaType,
  tmdbId,
  title,
  seasonNumber,
  existing,
  open,
  onOpenChange,
  onSaved,
}: ReviewComposerProps) {
  const isMobile = useMobile();
  const { trackAction } = useAnalytics();
  const [body, setBody] = useState(existing?.body ?? "");
  const [containsSpoilers, setContainsSpoilers] = useState(existing?.containsSpoilers ?? false);
  const [isPrivate, setIsPrivate] = useState(existing?.isPrivate ?? false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (body.trim().length < 3) {
      toast.error("Write a little more first");
      return;
    }
    setBusy(true);
    try {
      const result = await submitReviewAction({
        mediaType,
        tmdbId,
        seasonNumber,
        body: body.trim(),
        containsSpoilers,
        isPrivate,
      });
      if (result.ok) {
        trackAction({
          action: "review_submit",
          mediaType,
          itemId: tmdbId,
          itemTitle: title,
          metadata: { containsSpoilers, isPrivate, edit: existing !== null },
        });
        toast.success(
          result.review.status === "PENDING_REVIEW"
            ? "Review submitted — it will appear once checked"
            : "Review saved"
        );
        onSaved(result.review);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to save review");
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <div className="space-y-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
        rows={8}
        placeholder={`What did you think of ${title}?`}
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="text-right text-xs font-medium text-muted-foreground">
        {body.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
      </p>
      <div className="flex items-center justify-between py-1">
        <Label htmlFor="review-spoilers" className="font-normal">
          Contains spoilers
        </Label>
        <Switch id="review-spoilers" checked={containsSpoilers} onCheckedChange={setContainsSpoilers} />
      </div>
      <div className="flex items-center justify-between py-1">
        <div>
          <Label htmlFor="review-private" className="font-normal">
            Private
          </Label>
          <p className="text-xs font-medium text-muted-foreground">Only you can see it</p>
        </div>
        <Switch id="review-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
      </div>
      <Button className="w-full h-10" disabled={busy} onClick={() => void handleSubmit()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save changes" : "Post review"}
      </Button>
    </div>
  );

  const heading = `${existing ? "Edit" : "Write a"} review · ${title}${
    seasonNumber !== undefined ? ` S${seasonNumber}` : ""
  }`;

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={IS_IOS}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-lg font-semibold line-clamp-1">{heading}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">{form}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold line-clamp-1">{heading}</DialogTitle>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
