/**
 * Slug round-trip tests for topic keys — every genre a detail page can render
 * as a pill must produce a key that the [topic] route resolves. Guards against
 * the Jun 2026 class of 404s (plural `-movies` keys + non-popular genres like
 * "War & Politics" being unresolvable).
 */
import { describe, it, expect } from "vitest";
import { MOVIE_GENRES, TV_GENRES } from "../constants";
import { createTopicKey, parseTopicKey, getGenreMeta, getTopicMetaFromKey } from "./utils";

describe("topic key round-trip", () => {
  it.each(Object.values(MOVIE_GENRES))("movie genre %s resolves", (name) => {
    const key = createTopicKey("genre", name, "movie");
    const meta = getTopicMetaFromKey(key);
    expect(meta).toBeDefined();
    expect(meta?.filterParams.media_type).toBe("movie");
  });

  it.each(Object.values(TV_GENRES))("tv genre %s resolves", (name) => {
    const key = createTopicKey("genre", name, "tv");
    const meta = getTopicMetaFromKey(key);
    expect(meta).toBeDefined();
    expect(meta?.filterParams.media_type).toBe("tv");
  });

  it("resolves genre ids from the full TMDB list, not just popular subsets", () => {
    expect(getGenreMeta("War & Politics", "tv")?.filterParams.with_genres).toBe(10768);
    expect(getGenreMeta("Western", "movie")?.filterParams.with_genres).toBe(37);
    expect(getGenreMeta("History", "movie")?.filterParams.with_genres).toBe(36);
  });

  it("accepts legacy plural -movies keys (previously emitted by GenreBadge)", () => {
    expect(parseTopicKey("genre-science-fiction-movies")).toEqual({
      type: "genre",
      topic: "science-fiction",
      media: "movie",
    });
    expect(getTopicMetaFromKey("genre-action-movies")?.filterParams.with_genres).toBe(28);
    expect(getTopicMetaFromKey("genre-adventure-movies")?.filterParams.with_genres).toBe(12);
  });

  it("still rejects garbage keys", () => {
    expect(parseTopicKey("genre-action")).toBeNull();
    expect(parseTopicKey("bogus-action-movie")).toBeNull();
    expect(getTopicMetaFromKey("genre-not-a-genre-movie")).toBeUndefined();
  });
});
