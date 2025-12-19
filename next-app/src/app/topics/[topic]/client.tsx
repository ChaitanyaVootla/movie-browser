"use client";

import Link from "next/link";
import { ChevronLeft, Film, Tv, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DiscoverGrid,
  DiscoverScroller,
} from "@/components/features/discover";
import { cn } from "@/lib/utils";
import { buildBrowseUrl, type DiscoverParams } from "@/lib/discover";
import type { TopicMeta } from "@/lib/topics";
import type { MediaItem } from "@/types";

interface TopicDetailClientProps {
  topic: TopicMeta;
  initialResults: MediaItem[];
  totalPages: number;
  totalResults: number;
  variationPreviews: Record<string, MediaItem[]>;
}

export function TopicDetailClient({
  topic,
  initialResults,
  totalPages,
  totalResults,
  variationPreviews,
}: TopicDetailClientProps) {
  const mediaType = topic.filterParams.media_type as "movie" | "tv";
  const params = topic.filterParams as Partial<DiscoverParams> & {
    media_type: "movie" | "tv";
  };

  return (
    <div className="min-h-screen pt-14">
      {/* Header */}
      <header className="px-4 md:px-8 lg:px-12 py-4 border-b bg-muted/10">
        {/* Breadcrumb */}
        <Link
          href="/topics"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          All Topics
        </Link>

        {/* Title Row */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg",
              mediaType === "tv" ? "bg-blue-500/10" : "bg-amber-500/10"
            )}
          >
            {mediaType === "tv" ? (
              <Tv className="h-4 w-4 text-blue-500" />
            ) : (
              <Film className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold">{topic.name}</h1>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {mediaType === "tv" ? "Shows" : "Movies"}
          </Badge>
          {totalResults > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalResults.toLocaleString()} titles
            </span>
          )}
          <Button asChild variant="outline" size="sm" className="ml-auto gap-1.5">
            <Link href={buildBrowseUrl(params)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
            </Link>
          </Button>
        </div>
      </header>

      {/* Scroll Variations (sub-categories) */}
      {topic.scrollVariations && topic.scrollVariations.length > 0 && (
        <section className="py-8 space-y-8">
          {topic.scrollVariations.slice(0, 6).map((variation) => {
            const variationParams = {
              ...params,
              ...variation.filterParams,
            } as Partial<DiscoverParams> & { media_type: "movie" | "tv" };

            return (
              <DiscoverScroller
                key={variation.key}
                title={variation.name}
                initialResults={variationPreviews[variation.key] || []}
                params={variationParams}
              />
            );
          })}
        </section>
      )}

      {/* Main Grid */}
      <section className="px-4 md:px-8 lg:px-12 py-8">
        <DiscoverGrid
          title={`All ${topic.name}`}
          initialResults={initialResults}
          totalPages={totalPages}
          totalResults={totalResults}
          params={params}
          infiniteScroll
        />
      </section>
    </div>
  );
}

