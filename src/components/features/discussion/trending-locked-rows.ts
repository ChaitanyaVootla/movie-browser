/** Episodes ahead of the viewer's lifetime watermark → honest 🔒 rows (spec §2:
 * never leak ahead-episodes by title in a mixed activity list). */
export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}
export interface LockedRow extends EpisodeRef {
  locked: true;
}

export function lockedEpisodeRows(
  episodes: EpisodeRef[],
  watermark: { maxSeason: number | null; maxEpisode: number | null }
): LockedRow[] {
  const { maxSeason, maxEpisode } = watermark;
  return episodes
    .filter((e) => {
      if (maxSeason === null) return true; // anon: everything locked
      if (e.seasonNumber < maxSeason) return false;
      if (e.seasonNumber > maxSeason) return true;
      return e.episodeNumber > (maxEpisode ?? 0);
    })
    .map((e) => ({ ...e, locked: true as const }));
}
