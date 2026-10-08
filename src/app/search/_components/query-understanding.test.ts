import { describe, it, expect } from "vitest";
import type { IntentAnalysis } from "@/lib/search/intent";
import { buildUnderstanding, removeChipFromQuery } from "./query-understanding";

function intent(extracted: IntentAnalysis["extractedFilters"], cleanedQuery = "x"): IntentAnalysis {
  return {
    intent: "discovery",
    confidence: 1,
    extractedFilters: extracted,
    isExactLookup: false,
    cleanedQuery,
    needsLlmParsing: false,
  } as unknown as IntentAnalysis;
}

describe("buildUnderstanding (moved out of search/client.tsx)", () => {
  it("builds categorized chips and a summary", () => {
    const u = buildUnderstanding(
      "korean horror from the 90s",
      intent({ genres: ["horror"], decade: "90s", language: "ko" }, "korean horror")
    );
    expect(u.originalQuery).toBe("korean horror from the 90s");
    expect(u.cleanedQuery).toBe("korean horror");
    expect(u.filters.map((f) => [f.type, f.label, f.category])).toEqual([
      ["genre", "Horror", "content"],
      ["decade", "90S", "time"],
      ["language", "ko", "location"],
    ]);
    expect(u.summary).toBe("Searching for horror from the 90s in ko");
  });

  it("no filters → no summary", () => {
    expect(buildUnderstanding("inception", intent({})).summary).toBeUndefined();
  });
});

describe("removeChipFromQuery", () => {
  it("strips the chip's phrase and tidies whitespace", () => {
    expect(
      removeChipFromQuery("horror movies from 1995", {
        type: "year",
        label: "1995",
        value: "1995",
        removable: true,
      })
    ).toBe("horror movies");
    expect(
      removeChipFromQuery("dark thrillers on netflix", {
        type: "streaming",
        label: "On netflix",
        value: "netflix",
        removable: true,
      })
    ).toBe("dark thrillers");
  });

  it("falls back to 'movies' when nothing is left", () => {
    expect(
      removeChipFromQuery("horror", { type: "genre", label: "Horror", value: "horror", removable: true })
    ).toBe("movies");
  });
});
