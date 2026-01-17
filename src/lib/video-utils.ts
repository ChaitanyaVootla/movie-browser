import type { Video } from "@/types";

/**
 * Sort videos by type priority, official status, and date
 * Priority: Trailer > Teaser > Clip > Behind the Scenes > Featurette > Bloopers
 * Within same type: official first, then most recent
 */
export function sortVideos(videos: Video[]): Video[] {
  const typePriority: Record<string, number> = {
    Trailer: 0,
    Teaser: 1,
    Clip: 2,
    "Behind the Scenes": 3,
    Featurette: 4,
    Bloopers: 5,
  };

  return [...videos].sort((a, b) => {
    // 1. Type priority (Trailer > Teaser > etc.)
    const priorityA = typePriority[a.type] ?? 99;
    const priorityB = typePriority[b.type] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;

    // 2. Official videos first
    if (a.official !== b.official) return a.official ? -1 : 1;

    // 3. Most recent first (by published_at)
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
    return dateB - dateA; // Descending (newest first)
  });
}
