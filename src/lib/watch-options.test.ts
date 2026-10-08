import { describe, it, expect } from "vitest";
import { getWatchOptionsForCountry, mapWatchProvider, mergeDeepLinks, normalizeTMDBWatchProviders, providerKey } from "./watch-options";
import type { WatchProviderData } from "@/types";

const tmdbUS: WatchProviderData = {
  link: "https://www.themoviedb.org/movie/136315/watch?locale=US",
  flatrate: [
    { provider_id: 15, provider_name: "Hulu", logo_path: "/hulu.png" },
    { provider_id: 337, provider_name: "Disney Plus", logo_path: "/dplus.png" },
  ],
  buy: [{ provider_id: 2, provider_name: "Apple TV", logo_path: "/apple.png" }],
};

describe("providerKey", () => {
  it("normalises + and punctuation", () => {
    expect(providerKey("Disney+")).toBe(providerKey("Disney Plus"));
    expect(providerKey("Paramount+ Premium")).toBe("paramountpluspremium");
  });
});

describe("mergeDeepLinks", () => {
  it("swaps JustWatch landing links for deep links by provider name, keeps TMDB logos", () => {
    const tmdb = normalizeTMDBWatchProviders(tmdbUS, "US");
    const out = mergeDeepLinks(tmdb, [
      { name: "Hulu", link: "https://www.hulu.com/watch/abc", price: "Subscription" },
      { name: "Apple TV Store", link: "https://tv.apple.com/us/show/x", price: "Buy $19.99" },
    ]);
    const hulu = out.find((o) => o.name === "Hulu");
    expect(hulu).toMatchObject({ link: "https://www.hulu.com/watch/abc", isJustWatch: false, image: expect.stringContaining("/hulu.png") });
    // prefix match: TMDB "Apple TV" ↔ JustWatch "Apple TV Store"
    expect(out.find((o) => o.name === "Apple TV")).toMatchObject({ link: "https://tv.apple.com/us/show/x", price: "Buy $19.99" });
    // unmatched TMDB provider keeps its JustWatch link, sorted after deep links
    expect(out.at(-1)).toMatchObject({ name: "Disney Plus", isJustWatch: true });
  });

  it("appends scraped providers TMDB doesn't list only when we have an icon", () => {
    const tmdb = normalizeTMDBWatchProviders(tmdbUS, "US");
    const out = mergeDeepLinks(tmdb, [
      { name: "Netflix", link: "https://www.netflix.com/title/1", price: "Subscription" },
      { name: "Some Unknown Service", link: "https://unknown.example/1" },
    ]);
    expect(out.some((o) => o.key === "netflix" && o.link === "https://www.netflix.com/watch/1")).toBe(true);
    expect(out.some((o) => o.link.includes("unknown.example"))).toBe(false);
  });
});

describe("mergeDeepLinks plan variants", () => {
  it("drops a TMDB plan variant whose deep link is already shown", () => {
    const tmdb = normalizeTMDBWatchProviders(
      {
        link: "https://tmdb/watch",
        flatrate: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/n.png" },
          { provider_id: 1796, provider_name: "Netflix Standard with Ads", logo_path: "/na.png" },
        ],
      },
      "US"
    );
    const out = mergeDeepLinks(tmdb, [{ name: "Netflix", link: "https://www.netflix.com/title/1", price: "Subscription" }]);
    expect(out.map((o) => o.name)).toEqual(["Netflix"]);
    expect(out[0].link).toBe("https://www.netflix.com/watch/1");
  });
});

describe("getWatchOptionsForCountry", () => {
  it("uses the all-country map from cached-queries for non-IN countries", () => {
    const res = getWatchOptionsForCountry(
      "US",
      { watchLinksByCountry: { US: [{ name: "Hulu", link: "https://www.hulu.com/watch/abc" }] } },
      { US: tmdbUS }
    );
    expect(res.sourceCountry).toBe("US");
    expect(res.isFromFallback).toBe(false);
    expect(res.options[0]).toMatchObject({ name: "Hulu", link: "https://www.hulu.com/watch/abc" });
  });

  it("still honours the legacy India-only allWatchOptions", () => {
    const res = getWatchOptionsForCountry(
      "IN",
      { allWatchOptions: [{ name: "Netflix", link: "https://www.netflix.com/title/9", price: "Subscription" }] },
      undefined
    );
    expect(res.options[0]).toMatchObject({ key: "netflix", link: "https://www.netflix.com/watch/9" });
  });

  it("falls back to another country when the requested one has nothing", () => {
    const res = getWatchOptionsForCountry("ZZ", undefined, { US: tmdbUS });
    expect(res).toMatchObject({ sourceCountry: "US", isFromFallback: true });
  });
});

describe("mapWatchProvider word-start matching", () => {
  it("does not map cinema chains onto streaming icons", () => {
    expect(mapWatchProvider("Cineplex Entertainment", "https://www.cineplex.com/x")).toBeNull();
    expect(mapWatchProvider("Cineplex Australia", "https://www.cineplex.com.au/x")).toBeNull();
  });
  it("still maps real providers, including camelCase names", () => {
    expect(mapWatchProvider("JioHotstar", "https://www.hotstar.com/in/1")?.key).toBe("hotstar");
    expect(mapWatchProvider("Amazon Prime Video", "https://app.primevideo.com/x")?.key).toBe("amazon");
    expect(mapWatchProvider("Plex", "https://watch.plex.tv/x")?.key).toBe("plex");
    expect(mapWatchProvider("", "https://www.netflix.com/title/1")?.key).toBe("netflix");
    expect(mapWatchProvider("Apple TV Store", "https://tv.apple.com/x")?.key).toBe("apple");
  });
});
