/**
 * Detect the dedicated series discussions index page within the
 * `/series/[...params]` catch-all. URL shape: `/series/{id}/{slug}/discussions`
 * or `/series/{id}/discussions`. Returns the seriesId iff the LAST segment is
 * `discussions`, else null. Pure (no server imports) so it is unit-testable.
 */
export function parseSeriesDiscussions(routeParams: string[]): number | null {
  if (routeParams.length < 2) return null;
  if (routeParams[routeParams.length - 1] !== "discussions") return null;
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
