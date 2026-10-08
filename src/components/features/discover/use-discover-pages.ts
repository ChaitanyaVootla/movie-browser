"use client";

import { keepPreviousData, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import type { DiscoverParams } from "@/lib/discover";
import type { MediaItem } from "@/types";
import type { DiscoverResult } from "@/server/actions/discover";
import {
  DISCOVER_RESULTS_PATH,
  MAX_DISCOVER_PAGE,
  discoverResultsQuery,
} from "@/lib/discover-results";

export type DiscoverQueryParams = Partial<DiscoverParams> & { media_type: "movie" | "tv" };

/** Client-only display filters — they never change what the server returns. */
const CLIENT_ONLY_KEYS = new Set(["page", "hideWatched", "hideWatchlist", "hideDisliked"]);

/**
 * Stable identity of a discover request: every param that affects the server
 * response, with sorted keys and empty values dropped. Used as the TanStack
 * cache key (so Back re-renders every loaded page from cache) and to decide
 * whether server-provided initial results belong to the current params.
 */
export function discoverParamsKey(params: DiscoverQueryParams): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => {
      if (CLIENT_ONLY_KEYS.has(k)) return false;
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

export interface DiscoverInitial {
  results: MediaItem[];
  totalPages: number;
  totalResults: number;
}

/**
 * One page via the edge-cacheable GET endpoint (NOT the `discover` server
 * action: actions are POSTs, which no CDN caches — every filter change and
 * every infinite-scroll page used to be an origin TMDB round-trip).
 */
export async function fetchDiscoverPage(
  params: DiscoverQueryParams,
  page: number
): Promise<DiscoverResult> {
  const res = await fetch(`${DISCOVER_RESULTS_PATH}?${discoverResultsQuery(params, page)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`discover results ${res.status}`);
  return (await res.json()) as DiscoverResult;
}

/**
 * Paged discover results held in the TanStack Query cache instead of
 * component state. Remounting (Back from a detail page) restores ALL pages the
 * user had loaded — the precondition for restoring their scroll position.
 */
export function useDiscoverPages(params: DiscoverQueryParams, initial?: DiscoverInitial) {
  const key = discoverParamsKey(params);
  const query = useInfiniteQuery<
    DiscoverResult,
    Error,
    InfiniteData<DiscoverResult, number>,
    readonly unknown[],
    number
  >({
    queryKey: ["discover-pages", key],
    queryFn: ({ pageParam }) => fetchDiscoverPage(params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < Math.min(last.totalPages, MAX_DISCOVER_PAGE) ? last.page + 1 : undefined,
    initialData: initial
      ? {
          pages: [
            {
              page: 1,
              results: initial.results,
              totalPages: initial.totalPages,
              totalResults: initial.totalResults,
            },
          ],
          pageParams: [1],
        }
      : undefined,
    // Keep the previous filter's grid on screen while the next one loads.
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const pages = query.data?.pages ?? [];
  const results = dedupeResults(pages.flatMap((p) => p.results));
  const last = pages[pages.length - 1];
  return {
    results,
    totalResults: last?.totalResults ?? 0,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    /** No data at all yet (first load for these params). */
    isInitialLoading: query.isPending,
    /** Showing the previous params' results while the new ones load. */
    isPlaceholder: query.isPlaceholderData,
  };
}

/** Items can shift across page boundaries between requests — keep the first occurrence. */
export function dedupeResults(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    const k = `${item.media_type}-${item.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
