"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flag, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteComment } from "@/server/actions/comments";
import type { CommentDto, CommentThreadDto } from "@/server/db/postgres/comments";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { cn } from "@/lib/utils";
import { CommentComposer } from "./comment-composer";
import { RichTextBody } from "@/components/features/rich-text";
import { CueBadge } from "./cue-badge";
import { LinkCard } from "./link-card";
import { LikeButton } from "./like-button";
import { ReportDialog } from "./report-dialog";
import { ScopeBadge } from "./scope-badge";
import { AttachmentImages } from "@/components/features/media/attachment-images";

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function SingleComment({
  comment,
  viewerId,
  canInteract,
  onReply,
  onChanged,
  isReply = false,
}: {
  comment: CommentDto;
  viewerId: number | null;
  canInteract: boolean;
  onReply?: () => void;
  onChanged: () => void;
  isReply?: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const isOwn = viewerId !== null && comment.author?.id === viewerId;
  const username = comment.author?.username;

  const remove = async () => {
    const result = await deleteComment({ commentId: comment.id });
    if (result.ok) {
      toast.success("Comment deleted");
      onChanged();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div id={`comment-${comment.id}`} className={cn("flex gap-2.5", isReply && "pl-9")}>
      <div className="relative h-7 w-7 shrink-0 rounded-full overflow-hidden bg-muted">
        {comment.author?.image && (
          <Image
            src={comment.author.image}
            alt=""
            fill
            sizes="28px"
            className="object-cover"
            unoptimized
          />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {username ? (
            <Link
              href={`/u/${username}`}
              className="font-medium text-foreground/90 hover:underline"
            >
              @{username}
            </Link>
          ) : (
            <span className="font-medium text-foreground/70">
              {comment.author?.name ?? "former member"}
            </span>
          )}
          {comment.isCue ? <CueBadge className="ml-1" /> : null}
          <span>{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span>(edited)</span>}
          <ScopeBadge
            scope={comment.spoilerScope}
            scopeSeason={comment.scopeSeason}
            scopeEpisode={comment.scopeEpisode}
          />
        </div>
        <RichTextBody
          body={comment.body}
          entityMentions={comment.entityMentions}
          status={comment.status}
          idKey={comment.id}
        />
        {comment.linkCard && <LinkCard card={comment.linkCard} />}
        {comment.attachment && comment.status === "PUBLISHED" && (
          <AttachmentImages images={[comment.attachment]} className="mt-1.5" />
        )}
        {comment.status === "PUBLISHED" && (
          <div className="flex items-center gap-1 -ml-2">
            <LikeButton
              commentId={comment.id}
              initialLiked={comment.viewerLiked}
              initialCount={comment.likeCount}
              disabled={!canInteract}
            />
            {canInteract && onReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={onReply}
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> Reply
              </Button>
            )}
            {canInteract && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground"
                    aria-label="Comment actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {isOwn ? (
                    <DropdownMenuItem onClick={() => void remove()}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setReportOpen(true)}>
                      <Flag className="h-3.5 w-3.5 mr-2" /> Report
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
      <ReportDialog commentId={comment.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

export function CommentThread({
  thread,
  anchor,
  viewerId,
  canInteract,
  onChanged,
}: {
  thread: CommentThreadDto;
  anchor: DiscussionAnchor;
  viewerId: number | null;
  canInteract: boolean;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="space-y-3">
      <SingleComment
        comment={thread}
        viewerId={viewerId}
        canInteract={canInteract}
        onReply={() => setReplying((r) => !r)}
        onChanged={onChanged}
      />
      {thread.replies.map((reply) => (
        <SingleComment
          key={reply.id}
          comment={reply}
          viewerId={viewerId}
          canInteract={canInteract}
          onReply={() => setReplying(true)}
          onChanged={onChanged}
          isReply
        />
      ))}
      {thread.replyCount > thread.replies.length && (
        <p className="pl-9 text-xs text-muted-foreground">
          {thread.replyCount - thread.replies.length} more replies hidden by your spoiler settings
        </p>
      )}
      {replying && (
        <div className="pl-9">
          <CommentComposer
            anchor={anchor}
            parentId={thread.id}
            placeholder="Write a reply…"
            onPublished={() => {
              setReplying(false);
              onChanged();
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}
