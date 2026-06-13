"use client";

import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** Click-to-reveal spoiler cover. Not progress-gated (phase 1) — a plain reveal. */
export function SpoilerShield({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="flex w-full items-center gap-2 rounded-md bg-muted px-3 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <TriangleAlert className="h-4 w-4 flex-shrink-0 text-brand" />
      This review contains spoilers — tap to reveal
    </button>
  );
}
