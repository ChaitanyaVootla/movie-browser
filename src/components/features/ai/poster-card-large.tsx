"use client";

import { useState, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Film } from "lucide-react";
import { cn, getSlug } from "@/lib/utils";
import { CDN_IMAGE_BASE } from "@/lib/constants";
import type { ParsedMediaTag } from "@/lib/ai/parse-media-tags";
import { CARD_WIDTH, CARD_HEIGHT } from "./types";

// =============================================================================
// PosterCardLarge Component
// =============================================================================

interface PosterCardLargeProps {
  tag: ParsedMediaTag;
  onNavigate?: () => void;
}

export const PosterCardLarge = memo(function PosterCardLarge({
  tag,
  onNavigate,
}: PosterCardLargeProps) {
  const [imgError, setImgError] = useState(false);

  const href =
    tag.id !== null
      ? `/${tag.type}/${tag.id}/${getSlug(tag.title)}`
      : `/browse?q=${encodeURIComponent(tag.title)}`;
  const posterUrl = tag.id !== null ? `${CDN_IMAGE_BASE}/${tag.type}/${tag.id}/poster.webp` : null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group/card shrink-0 flex flex-col",
        "transition-transform duration-300",
        "hover:scale-[1.03]"
      )}
      style={{ width: CARD_WIDTH }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-xl",
          "bg-neutral-900",
          "shadow-[0_4px_16px_rgba(0,0,0,0.5),0_8px_32px_rgba(0,0,0,0.4)]",
          "ring-1 ring-white/15",
          "group-hover/card:shadow-[0_6px_24px_rgba(0,0,0,0.6),0_12px_40px_rgba(0,0,0,0.5)]",
          "group-hover/card:ring-white/25",
          "transition-shadow duration-300"
        )}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      >
        {posterUrl && !imgError ? (
          <Image
            src={posterUrl}
            alt={tag.title}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="object-cover"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <Film className="w-12 h-12 text-white/40" />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-center text-white line-clamp-1 group-hover/card:text-brand transition-colors">
        {tag.title}
      </p>
      {tag.description && (
        <p className="mt-0.5 text-xs text-center text-white/60 line-clamp-3 leading-snug">
          {tag.description}
        </p>
      )}
    </Link>
  );
});
