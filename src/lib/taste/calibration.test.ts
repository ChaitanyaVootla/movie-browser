import { describe, expect, it } from "vitest";
import { answerToRating, dayStamp, hashSeed, pickCalibrationDeck, type DeckCandidate } from "./calibration";

const GENRES = ["Action", "Comedy", "Drama", "Horror", "Romance", "Thriller", "Animation", "Documentary", "Crime", "Fantasy"];
const mk = (i: number, mediaType: "movie" | "series"): DeckCandidate => ({
  key: `${mediaType === "movie" ? "m" : "s"}:${i}`,
  mediaType,
  genres: [GENRES[i % GENRES.length]],
});
const movies = Array.from({ length: 40 }, (_, i) => mk(i, "movie"));
const series = Array.from({ length: 10 }, (_, i) => mk(100 + i, "series"));

describe("pickCalibrationDeck", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = pickCalibrationDeck(movies, series, hashSeed("7:20261012")).map((c) => c.key);
    const b = pickCalibrationDeck(movies, series, hashSeed("7:20261012")).map((c) => c.key);
    const c = pickCalibrationDeck(movies, series, hashSeed("7:20261013")).map((c) => c.key);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("12 unique titles, ≥ 3 series, ≥ 8 genres", () => {
    const deck = pickCalibrationDeck(movies, series, 42);
    expect(deck).toHaveLength(12);
    expect(new Set(deck.map((d) => d.key)).size).toBe(12);
    expect(deck.filter((d) => d.mediaType === "series").length).toBeGreaterThanOrEqual(3);
    expect(new Set(deck.flatMap((d) => d.genres)).size).toBeGreaterThanOrEqual(8);
  });
  it("tops up the series minimum even when the walk picked movies", () => {
    const deck = pickCalibrationDeck(movies, series.slice(0, 4), 1, 12, 4);
    expect(deck.filter((d) => d.mediaType === "series").length).toBe(4);
  });
  it("returns what exists when the pool is small", () => {
    expect(pickCalibrationDeck(movies.slice(0, 2), [], 1)).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("dayStamp + answer mapping", () => {
    expect(dayStamp(new Date("2026-10-12T23:00:00Z"))).toBe("20261012");
    expect(answerToRating("loved")).toEqual({ liked: true });
    expect(answerToRating("liked")).toEqual({ thumb: 1 });
    expect(answerToRating("disliked")).toEqual({ thumb: -1 });
    expect(answerToRating("skip")).toBeNull();
  });
});
