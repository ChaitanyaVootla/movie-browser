"use client";

import { memo, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedSourceTag } from "@/lib/ai/parse-media-tags";

interface SourceChipProps {
  tag: ParsedSourceTag;
  className?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Compact source citation chip for chat context
 * Shows favicon + title as a clickable link to the source URL
 */
export const SourceChip = memo(function SourceChip({ tag, className }: SourceChipProps) {
  const [faviconError, setFaviconError] = useState(false);
  const domain = getDomain(tag.url);
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : "";

  return (
    <a
      href={tag.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5 rounded-full",
        "bg-blue-500/10 hover:bg-blue-500/20",
        "border border-blue-400/20 hover:border-blue-400/30",
        "text-blue-300/90 hover:text-blue-200",
        "transition-all duration-200",
        "no-underline",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Favicon */}
      <div className="relative w-4 h-4 flex-shrink-0 flex items-center justify-center">
        {faviconUrl && !faviconError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            width={16}
            height={16}
            className="rounded-sm"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <Globe className="w-3.5 h-3.5 text-blue-400/60" />
        )}
      </div>
      <span className="text-[11px] font-medium truncate max-w-[120px]">{tag.title}</span>
      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
    </a>
  );
});
