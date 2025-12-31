"use client";

import { useState } from "react";
import Image from "next/image";
import { ThumbsUp, MessageCircle, ChevronDown, ChevronUp, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatViewCount, formatRelativeTime } from "@/lib/youtube-utils";
import type { YouTubeComment } from "@/types";

interface VideoCommentsProps {
  comments: YouTubeComment[];
  isLoading?: boolean;
  className?: string;
}

/**
 * Single comment item
 */
function CommentItem({
  comment,
  isExpanded: initialExpanded = false,
}: {
  comment: YouTubeComment;
  isExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const isLongComment = comment.textOriginal.length > 200;

  return (
    <div className="flex gap-2.5 py-2">
      {/* Author avatar */}
      <div className="relative h-6 w-6 flex-shrink-0 rounded-full overflow-hidden bg-muted">
        {comment.author.profileImageUrl && (
          <Image
            src={comment.author.profileImageUrl}
            alt={comment.author.displayName}
            fill
            className="object-cover"
            sizes="24px"
            unoptimized
          />
        )}
      </div>

      {/* Comment content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Author name and date */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80 truncate">
            {comment.author.displayName}
          </span>
          <span>{formatRelativeTime(comment.publishedAt)}</span>
        </div>

        {/* Comment text */}
        <div
          className={cn(
            "text-xs text-foreground/90 leading-relaxed",
            !isExpanded && isLongComment && "line-clamp-2"
          )}
          dangerouslySetInnerHTML={{ __html: comment.textDisplay }}
        />

        {/* Show more/less for long comments */}
        {isLongComment && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? "less" : "more"}
          </button>
        )}

        {/* Like count and reply count - compact */}
        <div className="flex items-center gap-2.5 text-muted-foreground text-[10px]">
          <div className="flex items-center gap-0.5">
            <ThumbsUp className="h-2.5 w-2.5" />
            <span>{formatViewCount(comment.likeCount)}</span>
          </div>

          {comment.isHearted && (
            <Heart className="h-2.5 w-2.5 text-red-500 fill-current" />
          )}

          {comment.replyCount > 0 && (
            <div className="flex items-center gap-0.5">
              <MessageCircle className="h-2.5 w-2.5" />
              <span>{comment.replyCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Video comments section component - in a card
 */
export function VideoComments({
  comments,
  isLoading = false,
  className,
}: VideoCommentsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading && comments.length === 0) {
    return (
      <div className={cn("rounded-lg bg-muted/30 p-3", className)}>
        <div className="flex gap-2.5">
          <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-full bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (comments.length === 0 && !isLoading) {
    return null;
  }

  const firstComment = comments[0];

  return (
    <div className={cn("rounded-lg bg-muted/30 overflow-hidden", className)}>
      {/* Collapsed view: first comment + show more */}
      {!isExpanded && (
        <div className="p-3">
          <CommentItem comment={firstComment} isExpanded />
          {comments.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-[11px] text-muted-foreground hover:text-foreground mt-1 -mb-1"
              onClick={() => setIsExpanded(true)}
            >
              Show more <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Expanded view: scrollable list */}
      {isExpanded && (
        <div className="p-3">
          <div className="flex items-center justify-end mb-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] text-muted-foreground hover:text-foreground px-2"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp className="h-2.5 w-2.5 mr-0.5" /> Less
            </Button>
          </div>
          <ScrollArea className="h-[250px]">
            <div className="space-y-1 pr-3">
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// Deprecated
export function VideoCommentsPreview() {
  return null;
}
