"use client";

import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { buildMentionExtension, CommentEmojiExtension } from "./comment-editor-extensions";

interface UseCommentEditorArgs {
  anchor: DiscussionAnchor;
  placeholder: string;
  /** Initial plain text (e.g. a discussion starter). Tokens in seedText render as text. */
  seedText: string;
  onChange?: () => void;
}

/**
 * Tiptap editor for the comment composer. StarterKit (paragraph + bold/italic/
 * strike/code/blockquote — the marks comment-body.tsx already renders) MINUS the
 * block features the body renderer ignores (headings/horizontal rule), plus the
 * custom `@` mention chip and the `:` emoji extension. The serialized body comes
 * from serializeToBody(editor.getJSON()) — see comment-editor-serialize.ts.
 */
export function useCommentEditor({ anchor, placeholder, seedText, onChange }: UseCommentEditorArgs): Editor | null {
  return useEditor({
    // SSR-safe: avoid hydration mismatch warnings (this lives in a client island).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        // Keep bold/italic/strike/code/blockquote/lists; drop the link mark (we
        // never serialize markdown links from chips — plain URLs unfurl server-side).
        link: false,
      }),
      Placeholder.configure({ placeholder }),
      buildMentionExtension(anchor),
      CommentEmojiExtension,
    ],
    content: seedText ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: seedText }] }] } : undefined,
    editorProps: {
      attributes: {
        // 40px+ effective tap height; semantic tokens; respects app keyboard handling.
        class:
          "min-h-[5rem] w-full rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm " +
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring prose-comment " +
          "[&_p]:my-0 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3",
      },
    },
    onUpdate: () => onChange?.(),
  });
}
