/**
 * Detect the dedicated movie discussions page within the `/movie/[...params]`
 * catch-all. URL shape: `/movie/{id}/{slug}/discussions` or `/movie/{id}/discussions`.
 * Returns the movieId iff the LAST segment is `discussions`, else null.
 * Pure (no server imports) so it is cheaply unit-testable.
 */
export function parseMovieDiscussions(routeParams: string[]): number | null {
  if (routeParams.length < 2) return null;
  if (routeParams[routeParams.length - 1] !== "discussions") return null;
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
