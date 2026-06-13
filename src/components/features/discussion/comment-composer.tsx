"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createComment, type CreateCommentResult } from "@/server/actions/comments";
import type { DiscussionAnchor, SpoilerScopeValue } from "@/server/services/discussion/comment-schemas";
import { useAnalytics } from "@/hooks/use-analytics";
import { scopeLabel } from "./scope-badge";

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
  const [body, setBody] = useState(seedText);
  const [scope, setScope] = useState<SpoilerScopeValue>(defaultScope);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

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
      toast.success("Comment posted");
      onPublished?.();
    } else if (result.status === "pending_review") {
      setBody("");
      setSuggestion(null);
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

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />

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
        <div className="flex items-center justify-between gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as SpoilerScopeValue)}>
            <SelectTrigger className="w-auto min-w-36 h-9 text-xs">
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
          <div className="flex items-center gap-2">
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
    </div>
  );
}
