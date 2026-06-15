"use client";

import Image from "next/image";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentionKind } from "./comment-editor-serialize";

/**
 * Atomic inline chip rendered for a mention node inside the Tiptap editor. The
 * node is `atom: true` (set on the extension) so a single Backspace deletes the
 * whole chip — the social-media standard. DESIGN.md tokens only; inline pill.
 *
 * Thumbnails come pre-prefixed (TMDB_IMAGE_BASE) from the suggestion item. They
 * may 404 in a dev worktree without TMDB env — the chip structure + name remain.
 */
export function CommentMentionChip(props: ReactNodeViewProps) {
  const attrs = props.node.attrs as {
    kind?: MentionKind;
    label?: string | null;
    id?: string | null;
    imageSrc?: string | null;
  };
  const kind = attrs.kind ?? "user";
  const label = attrs.label ?? attrs.id ?? "";
  const isUser = kind === "user";
  const isPerson = kind === "person" || kind === "user";
  const imageSrc = attrs.imageSrc ?? null;

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "mx-0.5 inline-flex max-w-[14rem] select-none items-center gap-1 rounded-md align-baseline",
        "border border-border bg-accent px-1.5 py-0.5 text-sm font-medium text-foreground",
        // Atom selection feedback (Tiptap toggles ProseMirror-selectednode).
        "[&.ProseMirror-selectednode]:ring-1 [&.ProseMirror-selectednode]:ring-ring"
      )}
      data-mention-kind={kind}
      contentEditable={false}
    >
      {imageSrc ? (
        <span
          className={cn(
            "relative h-4 w-4 flex-shrink-0 overflow-hidden bg-muted",
            isPerson ? "rounded-full" : "rounded-[2px]"
          )}
        >
          <Image src={imageSrc} alt="" fill sizes="16px" className="object-cover" unoptimized />
        </span>
      ) : (
        isUser && <AtSign className="h-3 w-3 flex-shrink-0 text-brand" aria-hidden />
      )}
      <span className="truncate">
        {isUser ? `@${label}` : label}
      </span>
    </NodeViewWrapper>
  );
}
