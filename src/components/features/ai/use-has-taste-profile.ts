"use client";

import { useEffect, useState } from "react";
import { useTasteUiStore } from "@/stores/taste-ui";
import { getViewerHasTasteProfile } from "@/server/actions/taste-explore";

/** One lookup per page session, shared by every caller. */
let lookup: Promise<boolean> | null = null;

/** Test hook. */
export function resetTasteProfileLookup(): void {
  lookup = null;
}

/**
 * Does the signed-in viewer have a taste profile (taste v2 spec §5.1)? The home
 * For-you island publishes it to `stores/taste-ui.ts` for free; a detail page
 * loaded directly (search, a shared link) never ran that island, so there we
 * ask the server once — and only on detail pages, the one surface whose prompts
 * ("Would I like this?") depend on it.
 */
export function useHasTasteProfile(isAuthenticated: boolean, pathname: string | null): boolean {
  const published = useTasteUiStore((s) => s.hasProfile);
  const known = useTasteUiStore((s) => s.reason !== null);
  const [fetched, setFetched] = useState(false);
  const isDetail = /^\/(movie|series)\//.test(pathname ?? "");
  const needLookup = isAuthenticated && isDetail && !known && !published;

  useEffect(() => {
    if (!needLookup) return;
    let cancelled = false;
    lookup ??= getViewerHasTasteProfile().catch(() => false);
    void lookup.then((has) => {
      if (!cancelled) setFetched(has);
    });
    return () => {
      cancelled = true;
    };
  }, [needLookup]);

  return isAuthenticated && (published || (!known && fetched));
}
