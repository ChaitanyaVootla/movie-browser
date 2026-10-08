import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/actions/discover", () => ({ discover: vi.fn() }));

import { dedupeResults, discoverParamsKey } from "./use-discover-pages";
import { browseParamsFromSearch } from "@/lib/discover";
import type { MediaItem } from "@/types";

describe("discoverParamsKey", () => {
  it("is order-independent and ignores empty values, page and client-only filters", () => {
    const a = discoverParamsKey({
      media_type: "movie",
      sort_by: "popularity.desc",
      with_genres: [28],
      page: 3,
      hideWatched: true,
      with_cast: [],
      certification: undefined,
    });
    const b = discoverParamsKey({ with_genres: [28], sort_by: "popularity.desc", media_type: "movie" });
    expect(a).toBe(b);
  });

  it("differs when a server-side filter differs", () => {
    expect(discoverParamsKey({ media_type: "movie", with_genres: [28] })).not.toBe(
      discoverParamsKey({ media_type: "movie", with_genres: [35] })
    );
    expect(discoverParamsKey({ media_type: "movie" })).not.toBe(
      discoverParamsKey({ media_type: "tv" })
    );
  });

  it("server and client derive the same key from the same URL (initial data is reused)", () => {
    const url = "type=tv&genres=18,80&providers=8&region=US&year=2020&page=4&hide_watched=1";
    const server = browseParamsFromSearch(new URLSearchParams(url));
    const client = browseParamsFromSearch(new URLSearchParams(url));
    expect(discoverParamsKey(server)).toBe(discoverParamsKey(client));
    // Every filter in the URL reaches the request (the old server page dropped
    // providers/year/runtime/cert/availability).
    expect(server).toMatchObject({
      media_type: "tv",
      sort_by: "popularity.desc",
      with_genres: [18, 80],
      with_watch_providers: [8],
      watch_region: "US",
      year: 2020,
      hideWatched: true,
    });
    expect(server).not.toHaveProperty("page");
  });
});

describe("dedupeResults", () => {
  it("keeps the first occurrence of each (media_type, id)", () => {
    const items = [
      { id: 1, media_type: "movie" },
      { id: 1, media_type: "tv" },
      { id: 1, media_type: "movie" },
      { id: 2, media_type: "movie" },
    ] as unknown as MediaItem[];
    expect(dedupeResults(items).map((i) => `${i.media_type}-${i.id}`)).toEqual([
      "movie-1",
      "tv-1",
      "movie-2",
    ]);
  });
});
