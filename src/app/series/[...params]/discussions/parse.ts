/** /series/[id]/discussions or /series/[id]/[slug]/discussions — id is params[0]. */
export function parseSeriesDiscussionsId(routeParams: string[]): number | null {
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
