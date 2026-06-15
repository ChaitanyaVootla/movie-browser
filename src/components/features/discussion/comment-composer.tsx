"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImageIcon, Sparkles, X } from "lucide-react";
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
import { MentionAutocomplete, type MentionItem } from "./mention-autocomplete";
import { CommentImagePicker } from "./comment-image-picker";
import { scopeLabel } from "./scope-badge";

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

/**
 * Trailing-mention detection. The @ must start the input or follow whitespace,
 * and the query may contain spaces (titles/people have spaces) — capture up to
 * 40 chars excluding newlines and a second @.
 */
const TRAILING_MENTION_RE = /(?:^|\s)@([^\n@]{0,40})$/;

/** Extract trailing @token from the current textarea value up to the caret. */
function getTrailingMention(value: string, caretPos: number): string | null {
  const before = value.slice(0, caretPos);
  const match = before.match(TRAILING_MENTION_RE);
  return match ? match[1] : null;
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
  const [body, setBody] = useState(seedText);
  const [scope, setScope] = useState<SpoilerScopeValue>(defaultScope);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [attachment, setAttachment] = useState<CommentAttachmentInput | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  // Autocomplete state: non-null = showing the palette.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Flattened, ordered item list owned by the composer for keyboard nav.
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const submit = async (confirmed: boolean, accepted: Suggestion | null = null) => {
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
      setBody("");
      setSuggestion(null);
      setAttachment(null);
      toast.success("Comment posted");
      onPublished?.();
    } else if (result.status === "pending_review") {
      setBody("");
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

  const handleBodyChange = (value: string) => {
    setBody(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const trailing = getTrailingMention(value, caret);
    setMentionQuery(trailing);
    setActiveIndex(0);
  };

  const closeMention = () => {
    setMentionQuery(null);
    setMentionItems([]);
    setActiveIndex(0);
  };

  /** Keyboard nav while the mention palette is open. Returns true if handled. */
  const handleMentionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (mentionQuery === null) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMention();
      return true;
    }
    if (mentionItems.length === 0) {
      // Palette is open but still searching/empty — swallow Enter so it neither
      // submits nor inserts a newline; let everything else through.
      if (e.key === "Enter") {
        e.preventDefault();
        return true;
      }
      return false;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % mentionItems.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const item = mentionItems[Math.min(activeIndex, mentionItems.length - 1)];
      if (item) insertToken(item.token);
      return true;
    }
    return false;
  };

  /** Insert a mention token at the current caret position, replacing the @token. */
  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    // Find the @token start — preserve any leading whitespace the regex matched.
    const match = before.match(TRAILING_MENTION_RE);
    let newBefore: string;
    if (match && match.index !== undefined) {
      const atIndex = before.indexOf("@", match.index);
      newBefore = before.slice(0, atIndex) + token + " ";
    } else {
      newBefore = before + token + " ";
    }
    const newBody = newBefore + after;
    setBody(newBody);
    setMentionQuery(null);
    setMentionItems([]);
    setActiveIndex(0);
    // Restore focus + place caret right after the inserted token.
    const caretPos = newBefore.length;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(caretPos, caretPos);
    }, 0);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={(e) => {
            handleMentionKeyDown(e);
          }}
          rows={3}
          maxLength={4000}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            anchor={anchor}
            activeIndex={activeIndex}
            onItemsChange={setMentionItems}
            onInsert={insertToken}
            onClose={closeMention}
          />
        )}
      </div>

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
        // Toolbar row: scope · @ hint · Add image · spacer · Cancel · Post
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Add image button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 sm:h-9 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setImagePickerOpen(true)}
            aria-label="Add image"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Add image
          </Button>

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
            <Button
              size="sm"
              disabled={submitting || body.trim().length < 2}
              onClick={() => void submit(false)}
            >
              {submitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      )}

      {/* Image picker dialog */}
      <Dialog open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Pick an image</DialogTitle>
          </DialogHeader>
          <CommentImagePicker
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
