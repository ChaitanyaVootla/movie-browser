"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { EditorContent } from "@tiptap/react";
import { Heart, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useAnalytics } from "@/hooks/use-analytics";
import { IS_IOS } from "@/lib/device";
import { submitReviewAction } from "@/server/actions/reviews";
import type {
  MediaAnchor,
  OwnReviewDTO,
  ReviewImage,
  SpoilerScopeValue,
  TrackedMediaType,
} from "@/types/social";
import {
  useRichTextEditor,
  serializeToBody,
  resolveEmojiUnicode,
  insertEmojiByName,
  RichTextToolbar,
  type EditorJSONNode,
} from "@/components/features/rich-text";
import { MediaImagePicker } from "@/components/features/media/media-image-picker";
import { StarRatingInput } from "./star-rating-input";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";
const MAX_IMAGES = 4;
const MAX_TITLE = 140;
const MAX_BODY = 20000;

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

/**
 * Rich review composer: half-star rating + "loved it" heart + optional headline
 * + the shared Tiptap body (emoji / @mentions / inline-spoiler / catalog images)
 * + spoiler-scope + privacy — reviewing and rating in one act. Desktop Dialog /
 * mobile Drawer (safe-area), edit-prefill from `existing`.
 *
 * `submitReviewAction` resolves the AI-suggested spoiler scope SERVER-SIDE (it
 * never surfaces a "scope suggestion" step to the client), so there is no
 * Tag-&-post override UI here — we just toast the status-aware result.
 */
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

  const [score, setScore] = useState<number | null>(existing?.score ?? null);
  const [liked, setLiked] = useState(existing?.liked ?? false);
  const [headline, setHeadline] = useState(existing?.title ?? "");
  const [scope, setScope] = useState<SpoilerScopeValue>(existing?.spoilerScope ?? "NONE");
  const [scopeSeason, setScopeSeason] = useState<number | null>(
    existing?.scopeSeason ?? seasonNumber ?? null
  );
  const [scopeEpisode, setScopeEpisode] = useState<number | null>(existing?.scopeEpisode ?? null);
  const [isPrivate, setIsPrivate] = useState(existing?.isPrivate ?? false);
  const [images, setImages] = useState<ReviewImage[]>(existing?.images ?? []);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bump on every editor update so the char counter + Submit disabled state stay live.
  const [, setRev] = useState(0);

  const anchor: MediaAnchor = useMemo(
    () =>
      mediaType === "movie"
        ? { type: "movie", movieId: tmdbId }
        : { type: "series", seriesId: tmdbId, seasonNumber: seasonNumber ?? null, episodeNumber: null },
    [mediaType, tmdbId, seasonNumber]
  );

  const editor = useRichTextEditor({
    anchor,
    placeholder: "Share your take…",
    seedText: existing?.body ?? "",
    onChange: () => setRev((r) => r + 1),
  });

  const isSeries = mediaType === "series";
  const episodeScopeAvailable = isSeries && seasonNumber != null;

  /** Current serialized body — the canonical token string the backend expects. */
  const currentBody = (): string =>
    editor ? serializeToBody(editor.getJSON() as EditorJSONNode, resolveEmojiUnicode) : "";

  const bodyLen = currentBody().trim().length;
  const canSubmit = !busy && bodyLen >= 3 && bodyLen <= MAX_BODY;

  // Keep the picker open for multi-select; clicking a chosen image removes it,
  // and the MAX_IMAGES cap is enforced here + on the toolbar button.
  const toggleImage = (img: ReviewImage) => {
    setImages((prev) =>
      prev.some((p) => p.imagePath === img.imagePath)
        ? prev.filter((p) => p.imagePath !== img.imagePath)
        : prev.length >= MAX_IMAGES
          ? prev
          : [...prev, img]
    );
  };

  const handleSubmit = async () => {
    const body = currentBody().trim();
    if (body.length < 3) {
      toast.error("Write a little more first");
      return;
    }
    setBusy(true);
    try {
      const result = await submitReviewAction({
        mediaType,
        tmdbId,
        seasonNumber,
        title: headline.trim() || undefined,
        body,
        score,
        liked,
        spoilerScope: scope,
        scopeSeason: scope === "EPISODE" ? scopeSeason : null,
        scopeEpisode: scope === "EPISODE" ? scopeEpisode : null,
        isPrivate,
        images: images.length > 0 ? images.slice(0, MAX_IMAGES) : undefined,
      });
      if (result.ok) {
        trackAction({
          action: "review_submit",
          mediaType,
          itemId: tmdbId,
          itemTitle: title,
          metadata: {
            scope: result.review.spoilerScope,
            isPrivate,
            scored: score !== null,
            liked,
            edit: existing !== null,
          },
        });
        toast.success(
          result.review.status === "PENDING_REVIEW"
            ? "Your review will appear after a quick check"
            : "Review posted"
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
      {/* Header: rating + heart + headline */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <StarRatingInput value={score} onChange={setScore} />
          <button
            type="button"
            aria-pressed={liked}
            aria-label="Loved it"
            onClick={() => setLiked((v) => !v)}
            className={cn(
              "flex min-h-[40px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              liked ? "text-brand" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Heart className={cn("h-4 w-4", liked && "fill-brand")} />
            Loved it
          </button>
        </div>
        <Input
          value={headline}
          onChange={(e) => setHeadline(e.target.value.slice(0, MAX_TITLE))}
          maxLength={MAX_TITLE}
          placeholder="Add a headline (optional)"
          aria-label="Review headline"
        />
      </div>

      {/* Body: shared rich editor */}
      <EditorContent editor={editor} />

      {/* Selected image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.imagePath}
              className="relative w-24 overflow-hidden rounded-lg border border-border"
            >
              <div className="relative aspect-video">
                <Image
                  src={`${TMDB_IMAGE_BASE}/w300${img.imagePath}`}
                  alt="Selected image"
                  fill
                  sizes="96px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((p) => p.imagePath !== img.imagePath))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: image · emoji · spoiler · scope */}
      <RichTextToolbar
        editor={editor}
        showImage={images.length < MAX_IMAGES}
        showSpoiler
        onAddImage={() => setImagePickerOpen(true)}
        onPickEmoji={(name) => editor && insertEmojiByName(editor, name)}
      >
        <Select value={scope} onValueChange={(v) => setScope(v as SpoilerScopeValue)}>
          <SelectTrigger className="w-auto min-w-36 h-10 sm:h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No spoilers</SelectItem>
            {episodeScopeAvailable && (
              <SelectItem value="EPISODE">Spoilers up to this point</SelectItem>
            )}
            <SelectItem value="WATCHED">
              {isSeries ? "Whole-series spoilers" : "Spoilers (watched it)"}
            </SelectItem>
            <SelectItem value="ENDING">Ending spoilers</SelectItem>
          </SelectContent>
        </Select>
      </RichTextToolbar>

      {/* EPISODE scope sub-pickers (series with season context) */}
      {scope === "EPISODE" && episodeScopeAvailable && (
        <div className="flex items-center gap-2">
          <Label htmlFor="review-scope-season" className="text-xs font-normal text-muted-foreground">
            Up to
          </Label>
          <Input
            id="review-scope-season"
            type="number"
            min={0}
            value={scopeSeason ?? ""}
            onChange={(e) => setScopeSeason(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Season"
            aria-label="Season number"
            className="h-10 w-24 text-sm"
          />
          <Input
            type="number"
            min={1}
            value={scopeEpisode ?? ""}
            onChange={(e) => setScopeEpisode(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Episode"
            aria-label="Episode number"
            className="h-10 w-24 text-sm"
          />
        </div>
      )}

      {/* Privacy */}
      <div className="flex items-center justify-between py-1">
        <div>
          <Label htmlFor="review-private" className="font-normal">
            Private
          </Label>
          <p className="text-xs font-medium text-muted-foreground">Only you can see it</p>
        </div>
        <Switch id="review-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {bodyLen.toLocaleString()} / {MAX_BODY.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" className="h-10 sm:h-9" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : existing ? (
              "Save changes"
            ) : (
              "Post review"
            )}
          </Button>
        </div>
      </div>

      {/* Standardized TMDB image picker — multi-select up to MAX_IMAGES */}
      <MediaImagePicker
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        anchor={anchor}
        multi
        title={`Add images · ${images.length}/${MAX_IMAGES}`}
        selectedPaths={images.map((i) => i.imagePath)}
        onPick={(p) =>
          toggleImage({ entityType: p.entityType, tmdbId: p.tmdbId, imagePath: p.imagePath })
        }
      />
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
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {form}
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold line-clamp-1">{heading}</DialogTitle>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
