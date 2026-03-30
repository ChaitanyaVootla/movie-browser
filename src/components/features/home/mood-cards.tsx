"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { buildBrowseUrl, type DiscoverParams } from "@/lib/discover";

export interface MoodOption {
  id: string;
  emoji: string;
  label: string;
  sublabel?: string;
  gradient: string;
  filters: Partial<DiscoverParams>;
}

const MOODS: MoodOption[] = [
  {
    id: "laugh",
    emoji: "😂",
    label: "Make Me Laugh",
    sublabel: "Comedy picks",
    gradient: "from-yellow-500/30 via-orange-500/20 to-amber-500/10",
    filters: {
      media_type: "movie",
      with_genres: [35], // Comedy
      "vote_average.gte": 6.5,
      "vote_count.gte": 500,
      sort_by: "popularity.desc",
    },
  },
  {
    id: "intense",
    emoji: "😰",
    label: "On The Edge",
    sublabel: "Thrillers & Action",
    gradient: "from-red-500/30 via-rose-500/20 to-pink-500/10",
    filters: {
      media_type: "movie",
      with_genres: [53, 28], // Thriller, Action
      "vote_average.gte": 6.5,
      "vote_count.gte": 500,
      sort_by: "popularity.desc",
    },
  },
  {
    id: "feel",
    emoji: "🥺",
    label: "In My Feels",
    sublabel: "Drama & Romance",
    gradient: "from-blue-500/30 via-indigo-500/20 to-violet-500/10",
    filters: {
      media_type: "movie",
      with_genres: [18, 10749], // Drama, Romance
      "vote_average.gte": 7,
      "vote_count.gte": 500,
      sort_by: "vote_average.desc",
    },
  },
  {
    id: "think",
    emoji: "🧠",
    label: "Blow My Mind",
    sublabel: "Sci-Fi & Mystery",
    gradient: "from-purple-500/30 via-violet-500/20 to-fuchsia-500/10",
    filters: {
      media_type: "movie",
      with_genres: [878, 9648], // Sci-Fi, Mystery
      "vote_average.gte": 7,
      "vote_count.gte": 500,
      sort_by: "vote_average.desc",
    },
  },
  {
    id: "family",
    emoji: "👨‍👩‍👧‍👦",
    label: "Family Night",
    sublabel: "All ages welcome",
    gradient: "from-green-500/30 via-emerald-500/20 to-teal-500/10",
    filters: {
      media_type: "movie",
      with_genres: [16, 10751], // Animation, Family
      "vote_average.gte": 6.5,
      "vote_count.gte": 500,
      sort_by: "popularity.desc",
      certification_country: "US",
      // Note: certification filter would need "PG" or less
    },
  },
  {
    id: "scary",
    emoji: "🌙",
    label: "Scare Me",
    sublabel: "Horror picks",
    gradient: "from-slate-500/30 via-zinc-600/20 to-neutral-700/10",
    filters: {
      media_type: "movie",
      with_genres: [27], // Horror
      "vote_average.gte": 6,
      "vote_count.gte": 300,
      sort_by: "popularity.desc",
    },
  },
];

interface MoodCardsProps {
  className?: string;
}

export function MoodCards({ className }: MoodCardsProps) {
  const { trackAction } = useAnalytics();

  return (
    <div className={cn("w-full", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🎭</span>
        <h2 className="text-lg font-semibold text-white">What&apos;s Your Mood?</h2>
      </div>

      {/* Horizontal scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide touch-manipulation -mx-4 px-4 md:mx-0 md:px-0">
        {MOODS.map((mood) => (
          <Link
            key={mood.id}
            href={buildBrowseUrl(mood.filters)}
            onClick={() =>
              trackAction({
                action: "mood_select",
                metadata: { moodId: mood.id, moodLabel: mood.label },
              })
            }
            className={cn(
              "relative flex flex-col items-center justify-center",
              "min-w-[120px] h-[100px] sm:min-w-[140px] sm:h-[110px]",
              "rounded-xl overflow-hidden",
              "bg-gradient-to-br",
              mood.gradient,
              "border border-white/10 hover:border-white/25",
              "transition-all duration-300 hover:scale-105",
              "group flex-shrink-0"
            )}
          >
            {/* Background shine effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="text-3xl sm:text-4xl">{mood.emoji}</span>
              <span className="text-xs sm:text-sm font-medium text-white text-center px-2">
                {mood.label}
              </span>
              {mood.sublabel && (
                <span className="text-xs text-white/70 text-center">
                  {mood.sublabel}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export { MOODS };
