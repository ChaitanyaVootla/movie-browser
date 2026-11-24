/**
 * Pins the two SERP-snippet defects found on 2026-11-24 (see meta-description.ts):
 * markdown asterisks leaking from AI hooks, and one-line person bios used as the
 * whole description.
 */
import { describe, it, expect } from "vitest";
import {
  META_DESCRIPTION_MAX,
  personDescription,
  stripInlineMarkdown,
  watchDescription,
} from "./meta-description";

describe("stripInlineMarkdown", () => {
  it("keeps the words and drops emphasis markers", () => {
    // A real hook from prod (movie 43387, Francis 1950).
    expect(
      stripInlineMarkdown("A talking mule gaslights the entire U.S. Army and it's *their* sanity that's in question."),
    ).toBe("A talking mule gaslights the entire U.S. Army and it's their sanity that's in question.");
    expect(stripInlineMarkdown("**Bold** and __strong__ and _soft_ and `code`")).toBe(
      "Bold and strong and soft and code",
    );
  });

  it("leaves non-emphasis asterisks and underscores alone", () => {
    expect(stripInlineMarkdown("Rated 5 * 3 * 2 stars")).toBe("Rated 5 * 3 * 2 stars");
    expect(stripInlineMarkdown("Season 2 of mr_robot_fans")).toBe("Season 2 of mr_robot_fans");
  });
});

describe("watchDescription", () => {
  const intro = "Where to watch Francis (1950) — streaming options, ratings, cast & reviews.";

  it("is the intro alone when there is no body", () => {
    expect(watchDescription(intro, null)).toBe(intro);
    expect(watchDescription(intro, "   ")).toBe(intro);
  });

  it("strips markdown from the hook and stays within the snippet length", () => {
    const d = watchDescription(intro, "A talking mule gaslights the entire U.S. Army and it's *their* sanity that's in question.");
    expect(d).not.toContain("*");
    expect(d.startsWith(intro)).toBe(true);
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });
});

describe("personDescription", () => {
  it("uses a full biography as-is (cut at a word)", () => {
    const bio =
      "Matthew Paige Damon (born October 8, 1970) is an American actor, producer, and screenwriter. In 2007 he was named one of Forbes' most bankable stars.";
    const d = personDescription({ name: "Matt Damon", biography: bio, job: "actor", knownFor: ["Interstellar"] });
    expect(d.startsWith("Matthew Paige Damon (born October 8, 1970)")).toBe(true);
    expect(d).not.toContain("Known for");
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it("extends a one-line bio with known-for titles and the page intent", () => {
    // 1,009 of 25,000 sitemapped people had a bio this short on 2026-11-24.
    const d = personDescription({
      name: "Hiroya Shimizu",
      biography: "Hiroya Shimizu is a Japanese actor.",
      job: "actor",
      knownFor: ["Tokyo Revengers", "Hanagatami", "Summer Blooms"],
    });
    expect(d).toBe(
      "Hiroya Shimizu is a Japanese actor. Known for Tokyo Revengers, Hanagatami and Summer Blooms. Explore their full filmography, photos, and where to watch their…",
    );
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(d.length).toBeGreaterThanOrEqual(120);
  });

  it("adds a full stop to a short bio that lacks one, and works without titles", () => {
    expect(personDescription({ name: "A", biography: "A is a Korean actress", knownFor: [] })).toBe(
      "A is a Korean actress. Explore their full filmography, photos, and where to watch their movies and shows.",
    );
  });

  it("builds from the job and titles when there is no biography", () => {
    expect(
      personDescription({ name: "Will Price", biography: "", job: "actor", knownFor: ["Brave the Dark", "Isle Child"] }),
    ).toBe(
      "Will Price is an actor known for Brave the Dark and Isle Child. Explore their full filmography, photos, and where to watch their movies and shows.",
    );
  });

  it("falls back to a generic line with nothing to go on", () => {
    expect(personDescription({ name: "X", biography: null, job: null })).toBe(
      "View X's full filmography, biography and photos, and find where to watch their movies and TV shows.",
    );
  });
});
