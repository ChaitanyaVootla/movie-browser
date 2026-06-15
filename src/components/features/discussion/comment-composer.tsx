"use client";

import { useState } from "react";
import Image from "next/image";
import { EditorContent } from "@tiptap/react";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createComment, type CreateCommentResult } from "@/server/actions/comments";
import type {
  CommentAttachmentInput,
  DiscussionAnchor,
  SpoilerScopeValue,
} from "@/server/services/discussion/comment-schemas";
import { useAnalytics } from "@/hooks/use-analytics";
import { scopeLabel } from "./scope-badge";
import {
  EntityImagePicker,
  useRichTextEditor,
  serializeToBody,
  type EditorJSONNode,
  resolveEmojiUnicode,
  insertEmojiByName,
  RichTextToolbar,
} from "@/components/features/rich-text";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

interface ComposerProps {
  anchor: DiscussionAnchor;
  parentId?: number | null;
  /** Episode pages default the scope to that episode */
  defaultScope?: SpoilerScopeValue;
  defaultScopeSeason?: number | null;
  defaultScopeEpisode?: number | null;
  placeholder?: string;
  /** Prefill from a discussion starter */
  seedText?: string;
  onPublished?: () => void;
  onCancel?: () => void;
}

interface Suggestion {
  scope: SpoilerScopeValue;
  season: number | null;
  episode: number | null;
}

export function CommentComposer({
  anchor,
  parentId = null,
  defaultScope = "NONE",
  defaultScopeSeason = null,
  defaultScopeEpisode = null,
  placeholder = "Share your take…",
  seedText = "",
  onPublished,
  onCancel,
}: ComposerProps) {
  const { trackAction } = useAnalytics();
  const [scope, setScope] = useState<SpoilerScopeValue>(defaultScope);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [attachment, setAttachment] = useState<CommentAttachmentInput | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  // Bump on every editor update so the Post button's disabled state stays live.
  const [, setRev] = useState(0);

  const editor = useRichTextEditor({
    anchor,
    placeholder,
    seedText,
    onChange: () => setRev((r) => r + 1),
  });

  /** Current serialized body — the canonical token string the backend expects. */
  const currentBody = (): string =>
    editor ? serializeToBody(editor.getJSON() as EditorJSONNode, resolveEmojiUnicode) : "";

  const isSeries = anchor.type === "series";
  const episodeScopeAvailable =
    isSeries && defaultScopeSeason !== null && defaultScopeEpisode !== null;

  const scopeForSubmit = (confirmed: boolean, accepted: Suggestion | null) => ({
    spoilerScope: accepted ? accepted.scope : scope,
    scopeSeason: accepted
      ? accepted.season
      : scope === "EPISODE"
        ? defaultScopeSeason
        : null,
    scopeEpisode: accepted
      ? accepted.episode
      : scope === "EPISODE"
        ? defaultScopeEpisode
        : null,
    confirmedScope: confirmed,
  });

  const clearEditor = () => {
    editor?.commands.clearContent(true);
  };

  const submit = async (confirmed: boolean, accepted: Suggestion | null = null) => {
    const body = currentBody();
    if (body.trim().length < 2) return;
    setSubmitting(true);
    const result: CreateCommentResult = await createComment({
      anchor,
      parentId,
      body,
      attachment,
      ...scopeForSubmit(confirmed, accepted),
    });
    setSubmitting(false);
    if (result.status === "published") {
      trackAction({
        action: "comment_post",
        mediaType: anchor.type,
        itemId: anchor.type === "movie" ? anchor.movieId : anchor.seriesId,
        metadata: { isReply: parentId !== null, scope: result.comment.spoilerScope },
      });
      clearEditor();
      setSuggestion(null);
      setAttachment(null);
      toast.success("Comment posted");
      onPublished?.();
    } else if (result.status === "pending_review") {
      clearEditor();
      setSuggestion(null);
      setAttachment(null);
      toast.info("Held for review — it'll appear once a moderator approves it.");
      onPublished?.();
    } else if (result.status === "scope_suggestion") {
      setSuggestion({
        scope: result.suggestedScope,
        season: result.suggestedSeason,
        episode: result.suggestedEpisode,
      });
    } else {
      toast.error(result.message);
    }
  };

  const canPost = !submitting && currentBody().trim().length >= 2;

  return (
    <div className="space-y-2">
      {/* Rich Tiptap editor: atomic mention chips, :emoji shortcodes, inline marks. */}
      <EditorContent editor={editor} />

      {/* Attachment preview */}
      {attachment && (
        <div className="relative w-32 overflow-hidden rounded-lg border border-border">
          <div className="relative aspect-video">
            <Image
              src={`${TMDB_IMAGE_BASE}/w300${attachment.imagePath}`}
              alt="Attachment preview"
              fill
              sizes="128px"
              className="object-cover"
              unoptimized
            />
          </div>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Remove attachment"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {suggestion ? (
        // AI scope suggestion — user-adjustable pre-publish (spec §5)
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            This looks like it contains{" "}
            {scopeLabel(suggestion.scope, suggestion.season, suggestion.episode)?.toLowerCase() ??
              "spoilers"}
            . Tag it so unwatched readers don&apos;t see it?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={submitting} onClick={() => void submit(true, suggestion)}>
              Tag &amp; post
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => void submit(true, null)}
            >
              Post as &quot;{scopeLabel(scope, defaultScopeSeason, defaultScopeEpisode) ?? "no spoilers"}&quot;
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        // Toolbar row: scope · Add image · Emoji · Spoiler · spacer · Cancel · Post
        <RichTextToolbar
          editor={editor}
          showImage
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
                <SelectItem value="EPISODE">
                  Spoilers up to S{defaultScopeSeason}E{defaultScopeEpisode}
                </SelectItem>
              )}
              <SelectItem value="WATCHED">
                {isSeries ? "Whole-series spoilers" : "Spoilers (watched it)"}
              </SelectItem>
              <SelectItem value="ENDING">Ending spoilers</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {/* Circles-readiness seam (spec §9) — NOT WIRED. Reserves the audience selector. */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              data-circles-readiness="true"
              title="Posting to circles is coming soon"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground"
            >
              Everyone
            </button>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button size="sm" disabled={!canPost} onClick={() => void submit(false)}>
              {submitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </RichTextToolbar>
      )}

      {/* Image picker dialog */}
      <Dialog open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Pick an image</DialogTitle>
          </DialogHeader>
          <EntityImagePicker
            anchor={anchor}
            onSelect={(att) => {
              setAttachment(att);
              setImagePickerOpen(false);
            }}
            onClose={() => setImagePickerOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
