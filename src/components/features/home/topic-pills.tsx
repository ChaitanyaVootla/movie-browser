"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PopularTopicItem } from "@/lib/topics";

// Emoji mappings for topics
const TOPIC_EMOJIS: Record<string, string> = {
  "genre-action-movie": "🎬",
  "genre-comedy-movie": "😂",
  "genre-horror-movie": "👻",
  "theme-superhero-movie": "🦸",
  "genre-drama-tv": "📺",
  "genre-sci-fi-fantasy-tv": "🚀",
  "theme-true-story-movie": "📖",
  "theme-space-movie": "🌌",
  // Fallbacks by type
  "genre-action": "⚡",
  "genre-comedy": "😆",
  "genre-horror": "💀",
  "genre-drama": "🎭",
  "genre-thriller": "😰",
  "genre-romance": "💕",
  "genre-sci-fi": "🔬",
  "genre-animation": "✨",
  "theme-zombie": "🧟",
  "theme-heist": "💰",
  "theme-spy": "🕵️",
  "theme-martial-arts": "🥋",
  "theme-time-travel": "⏰",
};

function getTopicEmoji(key: string): string {
  // Direct match
  if (TOPIC_EMOJIS[key]) return TOPIC_EMOJIS[key];
  
  // Partial match (e.g., "genre-action-movie" → "genre-action")
  const parts = key.split("-");
  if (parts.length >= 2) {
    const prefix = `${parts[0]}-${parts[1]}`;
    if (TOPIC_EMOJIS[prefix]) return TOPIC_EMOJIS[prefix];
  }
  
  return "🎬"; // Default
}

// Shorten display names
function getShortName(name: string): string {
  return name
    .replace(" Movies", "")
    .replace(" Shows", "")
    .replace(" TV", "")
    .replace("Sci-Fi & Fantasy", "Sci-Fi");
}

interface TopicPillsProps {
  topics: PopularTopicItem[];
  className?: string;
}

export function TopicPills({ topics, className }: TopicPillsProps) {
  if (topics.length === 0) return null;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide touch-manipulation">
        {topics.map((topic) => (
          <Link
            key={topic.key}
            href={`/topics/${topic.key}`}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
              "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
              "text-sm font-medium text-white/80 hover:text-white",
              "whitespace-nowrap transition-all duration-200",
              "flex-shrink-0"
            )}
          >
            <span className="text-base">{getTopicEmoji(topic.key)}</span>
            <span>{getShortName(topic.name)}</span>
          </Link>
        ))}
        
        {/* "More" pill linking to all topics */}
        <Link
          href="/topics"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
            "bg-brand/10 hover:bg-brand/20 border border-brand/30 hover:border-brand/50",
            "text-sm font-medium text-brand hover:text-brand",
            "whitespace-nowrap transition-all duration-200",
            "flex-shrink-0"
          )}
        >
          <span>More →</span>
        </Link>
      </div>
    </div>
  );
}



