"use client";

import { useMemo, useState } from "react";
import { Smile } from "lucide-react";
import { gitHubEmojis } from "@tiptap/extension-emoji";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A curated, popular-first emoji set for the picker grid (keeps the popover light). */
const PICKER_NAMES = [
  "smile", "grin", "joy", "rofl", "wink", "blush", "heart_eyes", "kissing_heart",
  "thinking", "neutral_face", "smirk", "sob", "rage", "scream", "sunglasses", "nerd_face",
  "heart", "broken_heart", "fire", "tada", "clap", "+1", "-1", "pray",
  "eyes", "100", "raised_hands", "muscle", "ok_hand", "wave", "rocket", "star",
  "popcorn", "movie_camera", "clapper", "tv", "film_frames", "trophy", "skull", "ghost",
];

interface PickedEmoji {
  name: string;
  emoji: string;
}

/**
 * Toolbar emoji PICKER (issue 3b). Opens a popover grid; selecting inserts the
 * unicode emoji into the editor via `onPick`. DESIGN.md tokens, 40px+ targets.
 */
export function EmojiPickerButton({ onPick }: { onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);

  const grid: PickedEmoji[] = useMemo(() => {
    const byName = new Map(gitHubEmojis.map((e) => [e.name, e]));
    const out: PickedEmoji[] = [];
    for (const name of PICKER_NAMES) {
      const e = byName.get(name);
      if (e?.emoji) out.push({ name: e.name, emoji: e.emoji });
    }
    return out;
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 sm:h-9 gap-1.5 text-xs text-muted-foreground"
          aria-label="Add emoji"
        >
          <Smile className="h-3.5 w-3.5" />
          Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {grid.map((e) => (
            <button
              key={e.name}
              type="button"
              title={`:${e.name}:`}
              aria-label={`Insert ${e.name} emoji`}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded text-lg leading-none",
                "hover:bg-accent focus:bg-accent focus:outline-none transition-colors"
              )}
              onClick={() => {
                onPick(e.name);
                setOpen(false);
              }}
            >
              {e.emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
