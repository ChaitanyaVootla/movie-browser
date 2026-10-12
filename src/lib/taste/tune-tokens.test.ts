import { describe, expect, it } from "vitest";
import { isEmptyTune, parseTuneString, tokensToTune, tuneToTokens } from "./tune-tokens";
import { TUNE_MAX_TOKENS } from "./recommend-types";

describe("tune tokens", () => {
  it("round-trips fixed and prefixed tokens", () => {
    const tune = tokensToTune(["series", "darker", "under100", "classic", "g:878", "l:ko", "m:identity"]);
    expect(tune).toEqual({
      media: "series",
      tone: "dark",
      maxRuntime: 100,
      era: "classic",
      genres: ["878"],
      languages: ["ko"],
      moods: ["identity"],
    });
    expect(tokensToTune(tuneToTokens(tune))).toEqual(tune);
  });

  it("drops unknown and malformed tokens", () => {
    expect(tokensToTune(["sad", "x:1", "g:", "g:DROP TABLE", ":darker", "g:a b"])).toEqual({});
  });

  it("enforces the caller's allowed per-user sets", () => {
    const tune = tokensToTune(["g:878", "g:27", "m:grief"], { genres: new Set(["878"]), moods: new Set() });
    expect(tune).toEqual({ genres: ["878"] });
  });

  it("caps at TUNE_MAX_TOKENS and dedupes", () => {
    const many = Array.from({ length: 20 }, (_, i) => `g:${i}`);
    expect(tokensToTune(many).genres).toHaveLength(TUNE_MAX_TOKENS);
    expect(tokensToTune(["g:1", "g:1"]).genres).toEqual(["1"]);
  });

  it("lets the later single-select token win", () => {
    expect(tokensToTune(["movies", "series"]).media).toBe("series");
  });

  it("never emits shuffle as a token", () => {
    expect(tuneToTokens({ shuffle: 42 })).toEqual([]);
    expect(isEmptyTune({ shuffle: 42 })).toBe(true);
  });

  it("parses the URL / tag string form", () => {
    expect(parseTuneString(" series, darker ,,")).toEqual(["series", "darker"]);
    expect(parseTuneString(null)).toEqual([]);
  });
});
