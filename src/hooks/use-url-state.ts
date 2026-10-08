"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { mergeSearch, withSearch, type ParamUpdates } from "@/lib/url-state";

/**
 * Read/write view state in the current URL's query string.
 *
 * Writes use native `history.replaceState` (Next integrates it: useSearchParams
 * updates, no RSC round-trip, no new history entry), so tab/sort/filter
 * changes are instant and Back still leaves the page in one step — but Back
 * INTO the page restores the exact tab and filters.
 *
 * The path is read from `window.location` at write time, so a component
 * embedded in another route (e.g. the watchlist inside /library) writes to the
 * page it is actually on.
 */
export function useUrlState(defaults: Record<string, string> = {}) {
  const searchParams = useSearchParams();

  const get = useCallback(
    (key: string): string | null => searchParams.get(key),
    [searchParams],
  );

  // `defaults` is usually an inline literal — key the callback on its content.
  const defaultsKey = JSON.stringify(defaults);
  const set = useCallback(
    (updates: ParamUpdates, { clearOthers = false }: { clearOthers?: boolean } = {}) => {
      const parsedDefaults = JSON.parse(defaultsKey) as Record<string, string>;
      const base = clearOthers ? "" : window.location.search;
      const next = mergeSearch(base, updates, parsedDefaults);
      const url = withSearch(window.location.pathname, next) + window.location.hash;
      // Keep a useHistoryDismiss overlay marker if one is on this entry; never
      // pass Next's own state back in (it would bypass Next's URL sync).
      const state = window.history.state as { __overlay?: unknown } | null;
      const data =
        state && typeof state.__overlay === "number" ? { __overlay: state.__overlay } : null;
      window.history.replaceState(data, "", url);
    },
    [defaultsKey],
  );

  return { get, set };
}
