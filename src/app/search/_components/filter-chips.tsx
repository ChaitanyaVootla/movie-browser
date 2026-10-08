"use client";

import * as React from "react";
import {
  Film,
  Tv,
  User,
  X,
  Globe,
  Languages,
  Clock,
  Star,
  Radio,
  Clapperboard,
  Tag,
  Heart,
  AlertTriangle,
  Activity,
  PlayCircle,
  ChevronDown,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FilterChip, FilterChipType, QueryUnderstanding } from "./search-types";

// Get icon for filter type
export function getFilterIcon(filterType: FilterChipType): React.ReactNode {
  switch (filterType) {
    case "genre":
    case "keywords":
      return <Film className="h-3 w-3" />;
    case "decade":
    case "year":
      return <Calendar className="h-3 w-3" />;
    case "similar":
      return <Sparkles className="h-3 w-3" />;
    case "person":
    case "cast":
    case "director":
      return <User className="h-3 w-3" />;
    case "streaming":
      return <Tv className="h-3 w-3" />;
    case "country":
      return <Globe className="h-3 w-3" />;
    case "language":
      return <Languages className="h-3 w-3" />;
    case "runtime":
      return <Clock className="h-3 w-3" />;
    case "rating":
      return <Star className="h-3 w-3" />;
    case "network":
      return <Radio className="h-3 w-3" />;
    case "collection":
      return <Clapperboard className="h-3 w-3" />;
    case "bestFor":
      return <Heart className="h-3 w-3" />;
    case "contentWarnings":
      return <AlertTriangle className="h-3 w-3" />;
    case "mood":
      return <Activity className="h-3 w-3" />;
    case "seriesStatus":
    case "seasonCount":
      return <PlayCircle className="h-3 w-3" />;
    default:
      return <Tag className="h-3 w-3" />;
  }
}

// Get chip color class based on category
export function getChipColorClass(category?: FilterChip["category"]): string {
  switch (category) {
    case "time":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "person":
      return "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30";
    case "location":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "platform":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "quality":
      return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
    case "warning":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    case "content":
    default:
      return ""; // Use default Badge styling
  }
}

// Maximum chips to show before collapsing
const MAX_VISIBLE_CHIPS = 4;

// Filter chips display component with expandable grouping
interface FilterChipsDisplayProps {
  understanding: QueryUnderstanding;
  removeFilterChip: (chip: FilterChip) => void;
  relaxationMessage: string | null;
}

export function FilterChipsDisplay({
  understanding,
  removeFilterChip,
  relaxationMessage,
}: FilterChipsDisplayProps) {
  const [expanded, setExpanded] = React.useState(false);
  const totalFilters = understanding.filters.length;
  const hasOverflow = totalFilters > MAX_VISIBLE_CHIPS;
  const visibleFilters = expanded ? understanding.filters : understanding.filters.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = totalFilters - MAX_VISIBLE_CHIPS;

  return (
    <div className="space-y-2">
      {/* Show cleaned query if different from original */}
      {understanding.cleanedQuery !== understanding.originalQuery &&
        understanding.cleanedQuery !== "movies" &&
        understanding.cleanedQuery !== "films" &&
        understanding.cleanedQuery !== "shows" && (
        <div className="text-sm text-muted-foreground">
          Searching for: &quot;{understanding.cleanedQuery}&quot;
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {visibleFilters.map((filter, i) => {
          const colorClass = getChipColorClass(filter.category);
          return (
            <Badge
              key={`${filter.type}-${filter.value}-${i}`}
              variant={colorClass ? "outline" : "secondary"}
              className={`flex items-center gap-1.5 py-1 ${colorClass}`}
            >
              {getFilterIcon(filter.type)}
              <span>{filter.label}</span>
              {filter.removable && (
                <button
                  onClick={() => removeFilterChip(filter)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  aria-label={`Remove ${filter.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}

        {/* Expandable toggle */}
        {hasOverflow && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <>
                <span>Show less</span>
                <ChevronDown className="h-3 w-3 rotate-180 transition-transform" />
              </>
            ) : (
              <>
                <span>+{hiddenCount} more</span>
                <ChevronDown className="h-3 w-3 transition-transform" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Relaxation message */}
      {relaxationMessage && (
        <div className="text-sm text-amber-500">
          {relaxationMessage}
        </div>
      )}
    </div>
  );
}

