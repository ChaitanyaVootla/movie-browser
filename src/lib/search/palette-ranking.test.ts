/**
 * Ranking model for the search palette.
 *
 * WHY THIS EXISTS — two user-reported defects, same root cause (source/position
 * decided precedence instead of relevance):
 *
 *  1. Typing "shan" showed our correct Postgres results (Shang-Chi, Shangri-La)
 *     for ~205ms and then REPLACED them with TMDB's worse ones ("Shan", "Xue Ding
 *     Shan"), because the Movies/Series groups were guarded by `!hasApiResults`.
 *     Reported twice by the user; reproduced with a render timeline.
 *  2. The People group had no relevance gate and rendered FIRST, so weak substring
 *     person matches topped the list: "inc" → Jennifer Inch, "the matrix" → Carlos
 *     Matrix, "wall-e" → Eli Wallach, "spiderman" → B Spiderman.
 *
 * Fixing (2) by simply moving People last would break the person queries that work
 * today ("tom holland", "cillian murphy"). So ordering must be RELEVANCE-based.
 * These tests encode the exact reported cases as the specification.
 */
import { describe, expect, it } from "vitest";

import { matchScore, orderGroups, squashText, type Rankable } from "./palette-ranking";

const M = (title: string, popularity = 1): Rankable => ({ mediaType: "movie", title, popularity });
const S = (title: string, popularity = 1): Rankable => ({ mediaType: "series", title, popularity });
const P = (title: string, popularity = 1): Rankable => ({ mediaType: "person", title, popularity });

describe("squashText", () => {
  it("normalises to [a-z0-9] so punctuation/spacing cannot decide relevance", () => {
    expect(squashText("Shang-Chi")).toBe("shangchi");
    expect(squashText("Star Wars")).toBe("starwars");
    expect(squashText("WALL·E")).toBe("walle");
  });
});

describe("matchScore", () => {
  it("ranks exact above prefix above word-prefix above contains", () => {
    expect(matchScore("the matrix", "The Matrix")).toBeGreaterThan(
      matchScore("the matrix", "The Matrix Reloaded")
    );
    expect(matchScore("inc", "Inception")).toBeGreaterThan(matchScore("inc", "Jennifer Inch"));
    expect(matchScore("shan", "Shang-Chi")).toBeGreaterThan(matchScore("shan", "Xue Ding Shan"));
  });

  it("treats a punctuation-free query as a direct hit (the squashed case)", () => {
    // "Star Wars" must beat "Starwars: Goretech" for the query "starwars".
    expect(matchScore("starwars", "Star Wars")).toBeGreaterThan(
      matchScore("starwars", "Starwars: Goretech")
    );
    expect(matchScore("walle", "WALL·E")).toBeGreaterThan(matchScore("walle", "Annabelle Wallis"));
  });

  it("scores a non-match zero", () => {
    expect(matchScore("zzzzqq", "Interstellar")).toBe(0);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(matchScore("SHANG-CHI", "shang chi")).toBeGreaterThan(0);
  });
});

describe("orderGroups — the reported defects", () => {
  const order = (q: string, g: Record<string, Rankable[]>) =>
    orderGroups(q, g).map((x) => x.key);

  it('"inc" puts Movies (Inception) above People (Jennifer Inch)', () => {
    expect(order("inc", { movies: [M("Inception", 30)], people: [P("Jennifer Inch")] })).toEqual([
      "movies",
      "people",
    ]);
  });

  it('"the matrix" puts Movies above People (Carlos Matrix)', () => {
    expect(
      order("the matrix", { movies: [M("The Matrix", 40)], people: [P("Carlos Matrix")] })
    ).toEqual(["movies", "people"]);
  });

  it('"wall-e" puts Movies above People (Eli Wallach)', () => {
    expect(order("wall-e", { movies: [M("WALL·E", 25)], people: [P("Eli Wallach")] })).toEqual([
      "movies",
      "people",
    ]);
  });

  it('"tom holland" STILL puts People first — must not regress person search', () => {
    expect(
      order("tom holland", {
        movies: [M("Tom Holland's Twisted Tales", 3)],
        people: [P("Tom Holland", 20)],
      })
    ).toEqual(["people", "movies"]);
  });

  it('"cillian murphy" STILL puts People first', () => {
    expect(
      order("cillian murphy", { movies: [M("Cillian Murphy: A Life", 1)], people: [P("Cillian Murphy", 18)] })
    ).toEqual(["people", "movies"]);
  });

  it('"breakingbad" puts the Series (Breaking Bad) above the Movie (Breaking Bad Wolf)', () => {
    expect(
      order("breakingbad", { movies: [M("Breaking Bad Wolf", 2)], series: [S("Breaking Bad", 50)] })
    ).toEqual(["series", "movies"]);
  });

  it('"shan" keeps Movies (Shang-Chi) ahead of People (Shane Ryan-Reid)', () => {
    expect(
      order("shan", { movies: [M("Shang-Chi and the Legend of the Ten Rings", 23)], people: [P("Shane Ryan-Reid")] })
    ).toEqual(["movies", "people"]);
  });

  it("DEMOTES an unexplainable group to last rather than dropping it", () => {
    // A 0 score means "the client cannot explain this match" — the backend may have
    // matched via person_aliases or original_title. Keep it, just last.
    expect(order("interstellar", { people: [P("Zbigniew Q")], movies: [M("Interstellar", 20)] })).toEqual([
      "movies",
      "people",
    ]);
  });

  it("sorts members inside a group by score, then popularity", () => {
    const [g] = orderGroups("star wars", {
      movies: [M("Star Wars: Visions", 5), M("Star Wars", 40), M("Star Warship", 90)],
    });
    expect(g.items.map((i) => i.title)).toEqual(["Star Wars", "Star Wars: Visions", "Star Warship"]);
  });
});
