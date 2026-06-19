"use client";

import { useState } from "react";
import { Star, StarHalf, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Canonical 1–10 score → 0.5–5 stars (score / 2). null/0 → 0 stars. */
export function scoreToStars(score: number | null): number {
  return score && score > 0 ? score / 2 : 0;
}

/** 0.5–5 stars → canonical 1–10 score (round(stars × 2)). 0 → null (unrated). */
export function starsToScoreLocal(stars: number): number | null {
  return stars > 0 ? Math.round(stars * 2) : null;
}

type StarSize = "sm" | "md" | "lg";

const STAR_PX: Record<StarSize, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-9 w-9",
};

interface StarRatingInputProps {
  /** Canonical 1–10 score, or null when unrated. */
  value: number | null;
  /** Fires the new canonical score (1–10) or null when cleared. */
  onChange: (score: number | null) => void;
  size?: StarSize;
  className?: string;
}

/**
 * Half-star rating control (0.5–5 stars ↔ 1–10 score). Pointer in the left half
 * of a star = .5; right half = full. Keyboard: Left/Right adjust by half a star,
 * Home clears. A visible clear control unrates. DESIGN.md: 40px+ touch targets,
 * semantic tokens (brand stars over muted track), no hardcoded colors.
 */
export function StarRatingInput({ value, onChange, size = "md", className }: StarRatingInputProps) {
  // While the pointer hovers, preview that value without committing it.
  const [hoverStars, setHoverStars] = useState<number | null>(null);

  const committedStars = scoreToStars(value);
  const displayStars = hoverStars ?? committedStars;

  const setFromStars = (stars: number) => onChange(starsToScoreLocal(stars));

  const handlePointer = (starIndex: number, e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    setHoverStars(starIndex + (isLeftHalf ? 0.5 : 1));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setFromStars(Math.min(5, committedStars + 0.5));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(0, committedStars - 0.5);
      onChange(starsToScoreLocal(next));
    } else if (e.key === "Home" || e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange(null);
    }
  };

  const px = STAR_PX[size];

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Your rating"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value ?? 0}
        aria-valuetext={value ? `${committedStars} of 5 stars` : "Not rated"}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHoverStars(null)}
        className="flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = displayStars - i; // 1 = full, 0.5 = half, ≤0 = empty
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              // 40px+ touch target via padding around the icon glyph.
              className="relative flex min-h-[40px] min-w-[40px] items-center justify-center"
              aria-label={`Rate ${i + 1} star${i === 0 ? "" : "s"}`}
              onPointerMove={(e) => handlePointer(i, e)}
              onClick={() => setFromStars(hoverStars ?? i + 1)}
            >
              {/* Track (empty) star */}
              <Star className={cn(px, "text-muted-foreground/40")} strokeWidth={1.5} />
              {/* Fill overlay */}
              {filled >= 1 ? (
                <Star
                  className={cn(px, "absolute fill-brand text-brand")}
                  strokeWidth={1.5}
                />
              ) : filled >= 0.5 ? (
                <StarHalf
                  className={cn(px, "absolute fill-brand text-brand")}
                  strokeWidth={1.5}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear rating"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
