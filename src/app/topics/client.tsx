"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Film, Tv, Sparkles, Layers, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscoverScroller } from "@/components/features/discover";
import { cn } from "@/lib/utils";
import type { TopicMeta } from "@/lib/topics";
import type { MediaItem } from "@/types";
import type { DiscoverParams } from "@/lib/discover";

interface TopicsClientProps {
  genreTopics: TopicMeta[];
  themeTopics: TopicMeta[];
  allTopics: TopicMeta[];
  topicPreviews: Record<string, MediaItem[]>;
}

// Limit quick links to prevent overwhelming UI
const MAX_QUICK_LINKS = 18;

export function TopicsClient({
  genreTopics,
  themeTopics,
  allTopics,
  topicPreviews,
}: TopicsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Filter topics based on search and tab
  const filteredTopics = useMemo(() => {
    let topics = allTopics;

    if (activeTab === "genres") {
      topics = genreTopics;
    } else if (activeTab === "themes") {
      topics = themeTopics;
    } else if (activeTab === "movies") {
      topics = allTopics.filter((t) => t.filterParams.media_type === "movie");
    } else if (activeTab === "tv") {
      topics = allTopics.filter((t) => t.filterParams.media_type === "tv");
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      topics = topics.filter((t) => t.name.toLowerCase().includes(query));
    }

    return topics;
  }, [allTopics, genreTopics, themeTopics, activeTab, searchQuery]);

  // Topics to display with scrollers (limit for performance)
  const displayTopics = filteredTopics.slice(0, 8);
  const quickLinkTopics = filteredTopics.slice(0, MAX_QUICK_LINKS);

  return (
    <div className="min-h-screen pt-14 pb-8">
      <div className="px-4 md:px-8 lg:px-12">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl md:text-2xl font-bold">Topics</h1>
            <span className="text-sm text-muted-foreground">
              {filteredTopics.length} collections
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-48 md:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            
            {/* View All Button */}
            <Button asChild variant="outline" size="sm">
              <Link href="/topics/all">
                All Topics
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="gap-1.5 text-xs px-3">
              <Layers className="h-3.5 w-3.5" />
              All
            </TabsTrigger>
            <TabsTrigger value="genres" className="gap-1.5 text-xs px-3">
              <Sparkles className="h-3.5 w-3.5" />
              Genres
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-1.5 text-xs px-3">
              <Sparkles className="h-3.5 w-3.5" />
              Themes
            </TabsTrigger>
            <TabsTrigger value="movies" className="gap-1.5 text-xs px-3">
              <Film className="h-3.5 w-3.5" />
              Movies
            </TabsTrigger>
            <TabsTrigger value="tv" className="gap-1.5 text-xs px-3">
              <Tv className="h-3.5 w-3.5" />
              TV
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Quick Links - Limited */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-1.5">
            {quickLinkTopics.map((topic) => (
              <Link key={topic.key} href={`/topics/${topic.key}`}>
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted text-xs py-0.5",
                    topic.filterParams.media_type === "tv"
                      ? "border-blue-500/30 hover:border-blue-500/50"
                      : "border-amber-500/30 hover:border-amber-500/50"
                  )}
                >
                  {topic.filterParams.media_type === "tv" ? (
                    <Tv className="h-3 w-3 mr-1 text-blue-500" />
                  ) : (
                    <Film className="h-3 w-3 mr-1 text-amber-500" />
                  )}
                  {topic.name}
                </Badge>
              </Link>
            ))}
            {filteredTopics.length > MAX_QUICK_LINKS && (
              <Link href="/topics/all">
                <Badge variant="secondary" className="cursor-pointer text-xs py-0.5">
                  +{filteredTopics.length - MAX_QUICK_LINKS} more
                </Badge>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Topic Scrollers */}
      <div className="space-y-8">
        {displayTopics.map((topic) => (
          <DiscoverScroller
            key={topic.key}
            title={topic.name}
            seeAllHref={`/topics/${topic.key}`}
            initialResults={topicPreviews[topic.key] || []}
            params={topic.filterParams as Partial<DiscoverParams> & { media_type: "movie" | "tv" }}
          />
        ))}

        {filteredTopics.length === 0 && (
          <div className="text-center py-16 px-4">
            <p className="text-lg font-medium text-muted-foreground">
              No topics found
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Try a different search term
            </p>
          </div>
        )}

        {filteredTopics.length > displayTopics.length && (
          <div className="text-center pb-4">
            <Button asChild variant="outline">
              <Link href="/topics/all">
                View all {filteredTopics.length} topics
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

