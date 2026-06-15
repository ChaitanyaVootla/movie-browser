/** The catch-all under /movie carries [id] or [id, slug]; the id is params[0]. */
export function parseDiscussionsParams(routeParams: string[]): number | null {
  const id = parseInt(routeParams[0] ?? "", 10);
  return Number.isNaN(id) ? null : id;
}
