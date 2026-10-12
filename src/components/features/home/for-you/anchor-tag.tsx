"use client";

/**
 * The one line under a rec card that says WHY (spec §3.2): the anchor's tiny
 * poster + title (because), a facet label (`Tag`) or a popular label
 * (`TrendingUp`). A button — it opens the Why sheet. 40px hit area on touch.
 */
import Image from "next/image";
import { Tag, TrendingUp } from "lucide-react";
import { forwardRef } from "react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CardTag } from "./rec-copy";

export const AnchorTag = forwardRef<HTMLButtonElement, { tag: CardTag; onOpen: () => void; className?: string }>(
  function AnchorTag({ tag, onOpen, className }, ref) {
    const label = tag.kind === "anchor" ? tag.anchor.title : tag.label;
    const poster = tag.kind === "anchor" && tag.anchor.posterPath ? `${TMDB_IMAGE_BASE}/w92${tag.anchor.posterPath}` : null;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={`Why this pick: ${label}`}
        className={cn(
          "-my-2 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-md py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0",
          className
        )}
      >
        {tag.kind === "anchor" ? (
          <span className="relative block h-[21px] w-[14px] flex-shrink-0 overflow-hidden rounded-[2px] bg-muted">
            {poster && <Image src={poster} alt="" fill sizes="14px" className="object-cover" unoptimized />}
          </span>
        ) : tag.kind === "facet" ? (
          <Tag className="size-3.5 flex-shrink-0" aria-hidden />
        ) : (
          <TrendingUp className="size-3.5 flex-shrink-0" aria-hidden />
        )}
        <span className="line-clamp-1">{label}</span>
      </button>
    );
  }
);
