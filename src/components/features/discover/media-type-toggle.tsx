"use client";

import { cn } from "@/lib/utils";
import { Film, Tv } from "lucide-react";

interface MediaTypeToggleProps {
  value: "movie" | "tv";
  onChange: (value: "movie" | "tv") => void;
  className?: string;
}

export function MediaTypeToggle({ value, onChange, className }: MediaTypeToggleProps) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg bg-muted/50 p-1",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange("movie")}
        className={cn(
          "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
          value === "movie"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Film className="h-4 w-4" />
        <span>Movies</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("tv")}
        className={cn(
          "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
          value === "tv"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Tv className="h-4 w-4" />
        <span>Series</span>
      </button>
    </div>
  );
}


