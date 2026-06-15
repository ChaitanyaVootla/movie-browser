"use client";

import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { ImageIcon, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./emoji-picker";

interface RichTextToolbarProps {
  /** The Tiptap editor instance (null while the client island mounts). */
  editor: Editor | null;
  /** Open the image picker. Only rendered when `showImage`. */
  onAddImage?: () => void;
  /** Insert an emoji by gitHubEmojis shortcode name. */
  onPickEmoji: (name: string) => void;
  /** Show the "Add image" button (default false). */
  showImage?: boolean;
  /** Show the inline-spoiler toggle button (default false). */
  showSpoiler?: boolean;
  /** Composer-specific controls (scope select, cancel/post, …) rendered after. */
  children?: ReactNode;
}

/**
 * Shared editor toolbar for the rich-text composer (discussion + reviews). Renders
 * the emoji picker, an optional image button, and an optional inline-spoiler
 * toggle, then a `children` slot for surface-specific controls. DESIGN.md tokens,
 * 40px+ touch targets, ghost buttons matching the discussion composer's style.
 */
export function RichTextToolbar({
  editor,
  onAddImage,
  onPickEmoji,
  showImage = false,
  showSpoiler = false,
  children,
}: RichTextToolbarProps) {
  const spoilerActive = editor?.isActive("spoiler") ?? false;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showImage && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 sm:h-9 gap-1.5 text-xs text-muted-foreground"
          onClick={onAddImage}
          aria-label="Add image"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Add image
        </Button>
      )}

      <EmojiPicker onPick={onPickEmoji} />

      {showSpoiler && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 sm:h-9 gap-1.5 text-xs text-muted-foreground",
            spoilerActive && "bg-accent text-foreground"
          )}
          aria-label="Mark as spoiler"
          aria-pressed={spoilerActive}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleSpoiler().run()}
        >
          <EyeOff className="h-3.5 w-3.5" />
          Spoiler
        </Button>
      )}

      {children}
    </div>
  );
}
