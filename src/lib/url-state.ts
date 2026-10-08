/**
 * Pure helpers for keeping small bits of view state (tabs, sort, filters) in
 * the URL query string, so Back from a detail page returns to the same tab and
 * filters (and the URL is shareable). Used by `useUrlState`.
 */

export type ParamUpdates = Record<string, string | null | undefined>;

/**
 * Apply `updates` to a query string. A value equal to its entry in `defaults`
 * (or null/undefined/"") removes the param, keeping URLs minimal and canonical.
 * Returns the new search string WITHOUT the leading "?" ("" when empty).
 */
export function mergeSearch(
  search: string,
  updates: ParamUpdates,
  defaults: Record<string, string> = {},
): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "" || defaults[key] === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  return params.toString();
}

/** `path` + "?" + search (or just `path` when search is empty). */
export function withSearch(path: string, search: string): string {
  return search ? `${path}?${search}` : path;
}

/** Narrow a raw param to one of `allowed`, else `fallback`. */
export function pickParam<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
