/**
 * movieToMarkdown: heading structure + the critical no-spoiler-leak invariant.
 */
import { describe, it, expect } from "vitest";
import type { Movie } from "@/types";
import type { AIDataResponse } from "@/server/services/ai-data-service";
import { movieToMarkdown } from "./movie";

const SPOILER_MARKER = "THE_BUTLER_DID_IT_SECRET";

// Movie fixture including the off-type "watch/providers" + scraped deep-link keys
// the PG transform emits. The scraped list intentionally includes an unnamed
// "primary" entry (the scraper duplicate) to pin the blank-link filter.
const movie: Movie & {
  "watch/providers": { results: Record<string, unknown> };
  scraped_watch_links: Record<string, Array<{ name: string; link: string; price?: string }>>;
} = {
  id: 27205,
  title: "Inception",
  original_title: "Inception",
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
  poster_path: null,
  backdrop_path: null,
  release_date: "2010-07-16",
  runtime: 148,
  vote_average: 8.4,
  vote_count: 34000,
  popularity: 100,
  adult: false,
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science Fiction" },
  ],
  tagline: "Your mind is the scene of the crime.",
  status: "Released",
  original_language: "en",
  origin_country: ["US"],
  credits: {
    cast: [
      { id: 6193, name: "Leonardo DiCaprio", character: "Cobb", profile_path: null, order: 0 },
      { id: 24045, name: "Joseph Gordon-Levitt", character: "Arthur", profile_path: null, order: 1 },
    ],
    crew: [
      { id: 525, name: "Christopher Nolan", job: "Director", department: "Directing", profile_path: null },
    ],
  },
  ratings: [
    { name: "TMDB", rating: "84" },
    { name: "IMDb", rating: "88" },
  ],
  "watch/providers": {
    results: {
      IN: { flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "" }] },
    },
  },
  scraped_watch_links: {
    IN: [
      { name: "", link: "https://primevideo.com/x" }, // unnamed primary — must be dropped
      { name: "Amazon Prime Video", link: "https://primevideo.com/x", price: "Subscription" },
    ],
  },
  production_companies: [{ id: 923, name: "Legendary Pictures", logo_path: null, origin_country: "US" }],
  videos: {
    results: [
      { id: "v1", key: "YoHD9XEInc0", name: "Official Trailer", site: "YouTube", type: "Trailer", official: true },
      { id: "v2", key: "8hP9D6kZseM", name: "Teaser", site: "YouTube", type: "Teaser", official: false },
    ],
  },
  keywords: {
    keywords: [
      { id: 1, name: "dream" },
      { id: 2, name: "heist" },
    ],
  },
};

const aiData: AIDataResponse = {
  hook: "A mind-bending heist inside dreams.",
  rawInput: null,
  mood: { pacing: "fast", intensity: "high", tone: "dark", emotional: "medium" },
  insights: {
    spoilerFree: {
      vibes: ["cerebral", "stylish"],
      themes: ["dreams", "guilt", "reality"],
      bestFor: [{ subcategory: "theatre", text: "big-screen viewing" }],
      highlights: [{ subcategory: "score", text: "Hans Zimmer's score" }],
      headsUp: [{ subcategory: "violence", text: "some gunfights" }],
      questions: ["What is real?"],
    },
    spoilerContent: {
      questions: [`Did the top stop spinning? ${SPOILER_MARKER}`],
      deepDive: [
        { subcategory: "insight", text: `The ending reveals ${SPOILER_MARKER}`, spoilerLevel: "HEAVY" },
      ],
    },
  },
  generatedAt: null,
  version: 1,
};

describe("movieToMarkdown", () => {
  const md = movieToMarkdown(movie, aiData);

  it("emits the expected headings", () => {
    expect(md).toContain("# Inception (2010)");
    expect(md).toContain("## Overview");
    expect(md).toContain("## Details");
    expect(md).toContain("## Ratings");
    expect(md).toContain("## Cast");
    expect(md).toContain("## Where to watch (India)");
    expect(md).toContain("## Links");
    expect(md).toContain("## AI insights");
  });

  it("includes spoiler-free AI content", () => {
    expect(md).toContain("dreams, guilt, reality");
    expect(md).toContain("A mind-bending heist inside dreams.");
  });

  it("renders key details and cast", () => {
    expect(md).toContain("Netflix");
    expect(md).toContain("148 min");
    expect(md).toContain("IMDb: 88");
  });

  it("links cast + director to their person .md pages", () => {
    expect(md).toContain(
      "[Leonardo DiCaprio](https://themoviebrowser.com/person/6193/leonardo-dicaprio.md) — Cobb"
    );
    expect(md).toContain(
      "[Christopher Nolan](https://themoviebrowser.com/person/525/christopher-nolan.md)"
    );
  });

  it("includes external reference links (TMDB)", () => {
    expect(md).toContain("[TMDB](https://www.themoviedb.org/movie/27205)");
  });

  it("links YouTube trailers (official first) and lists keywords + production", () => {
    expect(md).toContain("## Trailers");
    expect(md).toContain("[Official Trailer](https://www.youtube.com/watch?v=YoHD9XEInc0)");
    expect(md).toContain("- Keywords: dream, heist");
    expect(md).toContain("- Production: Legendary Pictures");
  });

  it("renders named scraped watch deep links but drops the unnamed primary", () => {
    expect(md).toContain(
      "[Amazon Prime Video](https://primevideo.com/x) (Subscription)"
    );
    expect(md).not.toContain("- []("); // no blank-label link
  });

  it("ends with the canonical link", () => {
    expect(md).toContain(
      "[View on The Movie Browser](https://themoviebrowser.com/movie/27205/inception)"
    );
  });

  it("NEVER leaks spoiler-content AI fields", () => {
    expect(md).not.toContain(SPOILER_MARKER);
    expect(md).not.toContain("The ending reveals");
    expect(md).not.toContain("Did the top stop spinning");
  });

  it("emits CDN poster + backdrop images when TMDB paths exist", () => {
    const withArt = movieToMarkdown(
      { ...movie, poster_path: "/poster.jpg", backdrop_path: "/backdrop.jpg" },
      aiData
    );
    expect(withArt).toContain("## Images");
    expect(withArt).toContain(
      "![Inception poster](https://image.themoviebrowser.com/movie/27205/poster.webp)"
    );
    expect(withArt).toContain(
      "![Inception backdrop](https://image.themoviebrowser.com/movie/27205/backdrop.webp)"
    );
  });

  it("omits the Images section when the title has no artwork", () => {
    // Base fixture has null poster/backdrop paths.
    expect(md).not.toContain("## Images");
  });
});
