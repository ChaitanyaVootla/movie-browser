/**
 * Regression tests for intent classification — collection extraction must
 * never leave a stopword residual as the search text.
 *
 * June 2026 prod bug (post error-isolation fix): "the lord of the rings"
 * matched COLLECTION_MAP ("lord of the rings" → "The Lord of the Rings"),
 * the matched phrase was stripped, and `cleanedQuery` became literally "the".
 * The semantic leg then searched "the" (prod logs: semantic_search
 * query:"the") and the /search page showed generic popular "The …" titles
 * (The Killer, The Thing, The Boys) with zero actual LOTR films. The
 * collection filter itself is display-only downstream, so cleanedQuery is the
 * only relevance signal for these queries.
 */

import { describe, it, expect } from "vitest";
import { classifyQueryIntent } from "./intent";

describe("classifyQueryIntent collection residual (LOTR regression)", () => {
  it('searches the collection name, not the residual "the", for "the lord of the rings"', () => {
    const result = classifyQueryIntent("the lord of the rings");

    expect(result.extractedFilters?.collection).toBe("The Lord of the Rings");
    // The bug: cleanedQuery was "the"
    expect(result.cleanedQuery).toBe("The Lord of the Rings");
  });

  it("uses the collection name when the residual is only generic media words", () => {
    const result = classifyQueryIntent("marvel movies");

    expect(result.extractedFilters?.collection).toBe("Marvel Cinematic Universe");
    expect(result.cleanedQuery).toBe("Marvel Cinematic Universe");
  });

  it("uses the collection name when stripping leaves an empty residual", () => {
    const result = classifyQueryIntent("star wars");

    expect(result.extractedFilters?.collection).toBe("Star Wars");
    expect(result.cleanedQuery).toBe("Star Wars");
  });

  it("keeps a meaningful residual when the query has real words beyond the franchise", () => {
    const result = classifyQueryIntent("jurassic park dinosaurs");

    expect(result.extractedFilters?.collection).toBe("Jurassic Park");
    // "dinosaurs" is a real search term — must not be replaced
    expect(result.cleanedQuery.toLowerCase()).toContain("dinosaurs");
  });

  it("leaves non-collection queries untouched", () => {
    const result = classifyQueryIntent("inception");

    expect(result.extractedFilters?.collection).toBeUndefined();
    expect(result.cleanedQuery).toBe("inception");
  });
});
