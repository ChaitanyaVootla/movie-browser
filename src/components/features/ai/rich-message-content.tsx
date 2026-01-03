"use client";

import { memo, useMemo } from "react";
import {
  parseContent,
  stripAllTags,
  getDataFetchIds,
  type ParsedMediaTag,
} from "@/lib/ai/parse-media-tags";
import { MediaChip, PosterRow } from "./media-chip";
import {
  ChatRatings,
  ChatWatchOptions,
  ChatTrailer,
  PersonChip,
  useTagData,
} from "./chat-tags";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface RichMessageContentProps {
  content: string;
  /** Show poster row below the text (default: true) */
  showPosterRow?: boolean;
  /** If true, only show poster row without any text */
  postersOnly?: boolean;
  className?: string;
}

// =============================================================================
// Rich Message Content
// =============================================================================

/**
 * Renders message content with poster cards and interactive tags
 * Parses [MOVIE:id:title], [SERIES:id:title], [RATINGS:type:id],
 * [WATCH:type:id], and [PERSON:id:name] tags from agent responses
 * 
 * When showPosterRow is true (default), media tags are stripped from text and shown as cards below.
 * Interactive tags (ratings, watch, person) are rendered inline.
 */
export const RichMessageContent = memo(function RichMessageContent({
  content,
  showPosterRow = true,
  postersOnly = false,
  className,
}: RichMessageContentProps) {
  const parsed = useMemo(() => parseContent(content), [content]);
  const dataFetchIds = useMemo(() => getDataFetchIds(content), [content]);
  
  // Fetch data for ratings/watch/person/trailer tags
  const { data: tagData, isLoading: isTagDataLoading } = useTagData(
    dataFetchIds.movieIds,
    dataFetchIds.seriesIds,
    dataFetchIds.personIds,
    dataFetchIds.trailerMovieIds,
    dataFetchIds.trailerSeriesIds
  );
  
  // Strip all tags from text when showing poster row (avoid redundancy)
  const cleanText = useMemo(() => {
    if (!showPosterRow || parsed.allTags.length === 0) return null;
    const stripped = stripAllTags(content)
      .replace(/`+/g, "")          // remove backticks
      .replace(/\*+/g, "")         // remove asterisks  
      .replace(/"+/g, "")          // remove quotes
      .replace(/^[-•]\s*/gm, "")   // remove bullet point prefixes
      .replace(/^>\s*/gm, "")      // remove blockquote prefixes
      .replace(/^#+\s*/gm, "")     // remove heading prefixes
      .trim();
    // Clean up excessive whitespace but PRESERVE single newlines for readability
    return stripped
      .replace(/[ \t]+/g, ' ')     // collapse horizontal whitespace only
      .replace(/\n{3,}/g, '\n\n')  // max 2 newlines in a row
      .replace(/^\s+|\s+$/gm, '')  // trim each line
      .trim();
  }, [content, showPosterRow, parsed.allTags.length]);

  // Check for inline tags (ratings, watch, trailer, person)
  const inlineTags = useMemo(() => {
    return parsed.allTags.filter(
      (tag) => tag.kind === "ratings" || tag.kind === "watch" || tag.kind === "trailer" || tag.kind === "person"
    );
  }, [parsed.allTags]);

  // If postersOnly, just show the poster row
  if (postersOnly) {
    return parsed.mediaTags.length > 0 ? (
      <PosterRow tags={parsed.mediaTags} className={className} />
    ) : null;
  }

  // If showing poster row, render clean text + interactive tags + cards
  if (showPosterRow && parsed.allTags.length > 0) {
    return (
      <div className={cn("space-y-3", className)}>
        {/* Clean text without tags */}
        {cleanText && (
          <p className="text-sm leading-relaxed whitespace-pre-line">{cleanText}</p>
        )}
        
        {/* Inline interactive tags row */}
        {inlineTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {inlineTags.map((tag, idx) => {
              if (tag.kind === "ratings") {
                const data = tag.mediaType === "movie"
                  ? tagData.movies[tag.id]
                  : tagData.series[tag.id];
                return (
                  <ChatRatings
                    key={`ratings-${tag.id}-${idx}`}
                    tag={tag}
                    data={data}
                    isLoading={isTagDataLoading}
                  />
                );
              }
              if (tag.kind === "watch") {
                const data = tag.mediaType === "movie"
                  ? tagData.movies[tag.id]
                  : tagData.series[tag.id];
                return (
                  <ChatWatchOptions
                    key={`watch-${tag.id}-${idx}`}
                    tag={tag}
                    data={data}
                    isLoading={isTagDataLoading}
                  />
                );
              }
              if (tag.kind === "trailer") {
                const trailerKey = `${tag.mediaType}:${tag.id}`;
                const trailerData = tagData.trailers[trailerKey];
                return (
                  <ChatTrailer
                    key={`trailer-${tag.mediaType}-${tag.id}-${idx}`}
                    tag={tag}
                    trailerData={trailerData}
                    isLoading={isTagDataLoading}
                  />
                );
              }
              if (tag.kind === "person") {
                const data = tag.id ? tagData.persons[tag.id] : null;
                return (
                  <PersonChip
                    key={`person-${tag.id ?? tag.name}-${idx}`}
                    tag={tag}
                    data={data}
                    isLoading={isTagDataLoading && !!tag.id}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
        
        {/* Poster cards */}
        {parsed.mediaTags.length > 0 && (
          <PosterRow tags={parsed.mediaTags} />
        )}
      </div>
    );
  }

  // No poster row - render with inline chips and interactive tags
  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
        {parsed.segments.map((segment, i) => {
          if (segment.type === "text") {
            // Clean text of any leftover formatting
            const cleanedText = segment.content
              .replace(/`+/g, "")
              .replace(/\*+/g, "");
            return <span key={i}>{cleanedText}</span>;
          }
          
          if (segment.type === "media") {
            const chipKey = segment.tag.id !== null
              ? `${segment.tag.type}-${segment.tag.id}`
              : `${segment.tag.type}-${segment.tag.title}-${i}`;
            return <MediaChip key={chipKey} tag={segment.tag} />;
          }
          
          if (segment.type === "ratings") {
            const data = segment.tag.mediaType === "movie"
              ? tagData.movies[segment.tag.id]
              : tagData.series[segment.tag.id];
            return (
              <ChatRatings
                key={`ratings-${segment.tag.id}-${i}`}
                tag={segment.tag}
                data={data}
                isLoading={isTagDataLoading}
              />
            );
          }
          
          if (segment.type === "watch") {
            const data = segment.tag.mediaType === "movie"
              ? tagData.movies[segment.tag.id]
              : tagData.series[segment.tag.id];
            return (
              <ChatWatchOptions
                key={`watch-${segment.tag.id}-${i}`}
                tag={segment.tag}
                data={data}
                isLoading={isTagDataLoading}
              />
            );
          }
          
          if (segment.type === "trailer") {
            const trailerKey = `${segment.tag.mediaType}:${segment.tag.id}`;
            const trailerData = tagData.trailers[trailerKey];
            return (
              <ChatTrailer
                key={`trailer-${segment.tag.mediaType}-${segment.tag.id}-${i}`}
                tag={segment.tag}
                trailerData={trailerData}
                isLoading={isTagDataLoading}
              />
            );
          }

          if (segment.type === "person") {
            const data = segment.tag.id ? tagData.persons[segment.tag.id] : null;
            return (
              <PersonChip
                key={`person-${segment.tag.id ?? segment.tag.name}-${i}`}
                tag={segment.tag}
                data={data}
                isLoading={isTagDataLoading && !!segment.tag.id}
              />
            );
          }
          
          return null;
        })}
      </div>
    </div>
  );
});

// =============================================================================
// Utility: Extract unique media tags from multiple messages
// =============================================================================

/**
 * Collect all unique media tags from an array of message contents
 * Useful for showing a combined poster grid
 */
export function collectMediaTags(contents: string[]): ParsedMediaTag[] {
  const seen = new Set<string>();
  const tags: ParsedMediaTag[] = [];

  for (const content of contents) {
    const parsed = parseContent(content);
    for (const tag of parsed.mediaTags) {
      // Use ID if available, otherwise fall back to title for uniqueness
      const key = tag.id !== null 
        ? `${tag.type}-${tag.id}` 
        : `${tag.type}-title:${tag.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    }
  }

  return tags;
}
