export type BadgeType =
  // Recency
  | "new"
  | "just-released"
  | "coming-soon"
  | "highly-anticipated"
  // Popularity
  | "trending"
  | "very-popular"
  | "viral"
  // Quality
  | "all-time-great"
  | "critically-acclaimed"
  | "hidden-gem"
  | "really-bad"
  // Series
  | "new-season"
  | "season-finale"
  | "series-finale"
  | "new-episode"
  | "returning-soon"
  | "currently-airing"
  | "mini-series"
  // Movie
  | "blockbuster"
  | "box-office-hit"
  | "indie"
  // User status (shown in bottom-right)
  | "watchlist"
  | "watched";

export interface MediaBadge {
  type: BadgeType;
  label: string;
  /** Short label for compact displays (cards) */
  shortLabel?: string;
  /** Tailwind classes for styling */
  className: string;
  /** Icon name from lucide-react (optional) */
  icon?: string;
  /** Priority for sorting (lower = higher priority, shown first) */
  priority: number;
  /** Tooltip/description */
  description?: string;
}

export interface BadgeOptions {
  /** Max badges to return */
  maxBadges?: number;
  /** Context where badges will be displayed */
  context?: "card" | "detail" | "hover";
}

