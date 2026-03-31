"use client";

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ParsedWebImageTag } from "@/lib/ai/parse-media-tags";

interface WebImageCardProps {
  tag: ParsedWebImageTag;
  className?: string;
}

/**
 * Compact web image card for chat context
 * Shows a thumbnail with description caption, clickable to open full image
 */
export const WebImageCard = memo(function WebImageCard({ tag, className }: WebImageCardProps) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return null;
  }

  return (
    <a
      href={tag.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block w-[140px] flex-shrink-0 rounded-lg overflow-hidden",
        "bg-white/5 hover:bg-white/10",
        "border border-white/10 hover:border-white/20",
        "transition-all duration-200",
        "no-underline",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative w-full aspect-[16/10] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tag.url}
          alt={tag.description}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setImgError(true)}
        />
      </div>
      <p className="px-2 py-1.5 text-[10px] text-white/60 leading-tight line-clamp-2">
        {tag.description}
      </p>
    </a>
  );
});
