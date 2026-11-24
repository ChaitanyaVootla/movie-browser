/**
 * The season a series detail page opens on: the latest regular season
 * (season_number > 0), else the first listed (specials-only shows).
 *
 * Shared by the server render (which inlines that season's episodes into the
 * ISR HTML) and SeasonSelector (which decides whether it still has to fetch).
 * They MUST agree, or the inlined episodes would belong to the wrong season.
 */
export function getDefaultSeasonNumber(seasons: ReadonlyArray<{ season_number: number }>): number {
  const regular = seasons.filter((s) => s.season_number > 0);
  const chosen = regular[regular.length - 1] ?? seasons[0];
  return chosen?.season_number ?? 1;
}
