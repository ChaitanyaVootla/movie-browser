import { describe, expect, it } from "vitest";
import {
  matchesTune,
  popularLabel,
  seededRandom,
  tuneAvailability,
  tuneValue,
  userTuneChips,
  type TunableCandidate,
} from "./tune-filter";
import { tokensToTune } from "./tune-tokens";

const c = (over: Partial<TunableCandidate> = {}): TunableCandidate => ({
  mediaType: "movie",
  genres: ["Science Fiction"],
  language: "en",
  runtimeMinutes: 95,
  year: 2021,
  tone: "dark",
  tags: ["identity and memory", "tone:dark"],
  ...over,
});

describe("tuneValue", () => {
  it("slugs free text to the token alphabet", () => {
    expect(tuneValue("Science Fiction")).toBe("science-fiction");
    expect(tuneValue("Sci-Fi & Fantasy")).toBe("sci-fi-fantasy");
    expect(tuneValue("tone:dark")).toBe("tone-dark");
    expect(tuneValue("  ")).toBe("");
  });
});

describe("matchesTune", () => {
  it("an empty tune keeps everything", () => {
    expect(matchesTune(c({ runtimeMinutes: null, year: null, tone: null }), {})).toBe(true);
  });
  it("media / runtime / tone / era", () => {
    expect(matchesTune(c(), tokensToTune(["series"]))).toBe(false);
    expect(matchesTune(c(), tokensToTune(["under100"]))).toBe(true);
    expect(matchesTune(c({ runtimeMinutes: 130 }), tokensToTune(["under100"]))).toBe(false);
    expect(matchesTune(c({ runtimeMinutes: null }), tokensToTune(["under100"]))).toBe(false);
    expect(matchesTune(c(), tokensToTune(["lighter"]))).toBe(false);
    expect(matchesTune(c(), tokensToTune(["recent"]))).toBe(true);
    expect(matchesTune(c(), tokensToTune(["classic"]))).toBe(false);
    expect(matchesTune(c({ year: 1999 }), tokensToTune(["classic"]))).toBe(true);
  });
  it("OR inside a family, AND across families", () => {
    expect(matchesTune(c(), tokensToTune(["g:thriller", "g:science-fiction"]))).toBe(true);
    expect(matchesTune(c(), tokensToTune(["g:thriller"]))).toBe(false);
    expect(matchesTune(c({ language: "ko" }), tokensToTune(["l:ko", "g:science-fiction"]))).toBe(true);
    expect(matchesTune(c(), tokensToTune(["l:ko"]))).toBe(false);
    expect(matchesTune(c(), tokensToTune(["m:identity-and-memory"]))).toBe(true);
    expect(matchesTune(c(), tokensToTune(["m:survival"]))).toBe(false);
  });
});

describe("userTuneChips", () => {
  it("top-3 genres, non-English languages, top-2 non-neutral moods", () => {
    const chips = userTuneChips({
      genres: [{ label: "Thriller" }, { label: "Science Fiction" }, { label: "Drama" }, { label: "Comedy" }],
      languages: [
        { key: "en", label: "English" },
        { key: "ko", label: "Korean" },
      ],
      moods: [
        { key: "intensity:medium", label: "Medium intensity" },
        { key: "tone:dark", label: "Dark tone" },
        { key: "identity and memory", label: "Identity and memory" },
        { key: "pacing:slow", label: "Slow-burn" },
        { key: "survival", label: "Survival" },
      ],
    });
    expect(chips.map((x) => x.token)).toEqual([
      "g:thriller",
      "g:science-fiction",
      "g:drama",
      "l:ko",
      "m:identity-and-memory",
      "m:pacing-slow",
    ]);
  });
  it("round-trips through tokensToTune with the allowed sets", () => {
    const chips = userTuneChips({ genres: [{ label: "Sci-Fi & Fantasy" }], languages: [], moods: [] });
    const tune = tokensToTune(
      chips.map((x) => x.token),
      { genres: new Set(["sci-fi-fantasy"]) }
    );
    expect(tune.genres).toEqual(["sci-fi-fantasy"]);
    expect(matchesTune(c({ genres: ["Sci-Fi & Fantasy"] }), tune)).toBe(true);
  });
});

describe("tuneAvailability", () => {
  it("counts survivors per token", () => {
    const pool = [c(), c({ mediaType: "series", runtimeMinutes: 45 }), c({ tone: "light", year: 1990 })];
    expect(tuneAvailability(pool, ["series", "lighter", "classic", "darker"])).toEqual({
      series: 1,
      lighter: 1,
      classic: 1,
      darker: 2,
    });
  });
});

describe("seededRandom / popularLabel", () => {
  it("is deterministic per seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
  it("labels top-ups", () => {
    expect(popularLabel({ genres: ["thriller"] }, () => "Thriller")).toBe("Popular thriller");
    expect(popularLabel({ media: "series" })).toBe("Popular series");
    expect(popularLabel({})).toBe("Popular picks");
  });
});
