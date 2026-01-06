// Media components - shared between movie and series details pages
export { GenreBadge, GenreList } from "./genre-badge";
export { MediaBadges, SingleBadge } from "./media-badges";
export { DetailBadges } from "./detail-badges";
export { RatingsBar } from "./ratings-bar";
export { WatchOptions } from "./watch-options";
export { MediaActions } from "./media-actions";
export { MediaActionBar } from "./media-action-bar";
export { QuickTake } from "./quick-take";
export { MediaBackdrop, TrailerOverlay } from "./media-backdrop";
export { HeroContent, heroContainerVariants, heroItemVariants } from "./hero-content";
export { MediaHero } from "./media-hero";
export { HeroBackdropShell } from "./hero-backdrop-shell";
export { HeroLogoShell } from "./hero-logo-shell";
export {
  HeroMediaProvider,
  HeroMediaUpdater,
  useHeroMedia,
  type HeroMediaData,
} from "./hero-media-context";
export { MediaOverview } from "./media-overview";

// Detail section components
export { KeywordsList } from "./keywords-list";
export { CountryLanguageBadges } from "./country-language-badges";
export { ContentWarningLink } from "./content-warning-link";

// Gallery/Scroller components
export { ScrollContainer, useScrollDrag } from "./scroll-container";
export { MediaScroller } from "./media-scroller";
export { VideoGallery, VideoCard } from "./video-gallery";
export { VideoStats, VideoStatsSkeleton, VideoStatsCompact, VideoLikeBar } from "./video-stats";
export { VideoComments, VideoCommentsPreview } from "./video-comments";
export { ImageGallery } from "./image-gallery";

// Related content components
export { RecommendationsSection } from "./recommendations-section";
export { CollectionSection } from "./collection-section";

// Wide card components (for recents, continue watching)
export { WideCard, WideCardSkeleton } from "./wide-card";
export { WideCarousel } from "./wide-carousel";

// Tracking components
export { RecentTracker } from "./recent-tracker";

// AI-generated content components
export { AIQuestionsSection } from "./ai-questions-section";

// User status badge (watchlist/watched indicator)
export { UserStatusBadge, useIsWatched } from "./user-status-badge";

// Admin tools
export { EnrichButton } from "./enrich-button";
