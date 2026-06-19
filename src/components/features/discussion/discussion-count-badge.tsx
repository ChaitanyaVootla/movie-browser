import { MessageCircle } from "lucide-react";

/** Cards/search show the count ONLY at/above the invite threshold (spec §4: a low
 * count is negative social proof — don't surface "2 comments" on a card). */
export function shouldShowBadge(count: number, threshold = 5): boolean {
  return count >= threshold;
}

export function DiscussionCountBadge({ count, threshold = 5 }: { count: number; threshold?: number }) {
  if (!shouldShowBadge(count, threshold)) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MessageCircle className="h-3 w-3" />
      {count}
    </span>
  );
}
