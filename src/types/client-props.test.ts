/**
 * Person filmography must not LINK to adult titles.
 *
 * An indexable person page is a crawlable link surface: linking its credits to
 * adult titles keeps Googlebot spending throttled crawl budget on pages we
 * deliberately noindex. Mirrors the SQL `adult IS NOT TRUE` — only an explicitly
 * flagged credit is dropped. See `.claude/rules/seo-search-console.md`.
 */
import { describe, it, expect } from "vitest";
import type { PersonCombinedCastCredit, PersonCombinedCrewCredit } from "@/types";
import {
  extractKnownForCredits,
  extractUpcomingLatestCredits,
  extractFilmographyCredits,
} from "./client-props";

function cast(
  id: number,
  title: string,
  adult: boolean,
  overrides: Partial<PersonCombinedCastCredit> = {}
): PersonCombinedCastCredit {
  return {
    id,
    media_type: "movie",
    title,
    release_date: "2010-01-01",
    poster_path: `/${id}.jpg`,
    backdrop_path: null,
    vote_average: 7,
    vote_count: 500,
    popularity: 50,
    adult,
    character: "Someone",
    credit_id: `c${id}`,
    order: 0,
    ...overrides,
  };
}

function crew(
  id: number,
  title: string,
  adult: boolean
): PersonCombinedCrewCredit {
  return {
    id,
    media_type: "movie",
    title,
    release_date: "2010-01-01",
    poster_path: `/${id}.jpg`,
    backdrop_path: null,
    vote_average: 7,
    vote_count: 500,
    popularity: 50,
    adult,
    job: "Director",
    department: "Directing",
    credit_id: `w${id}`,
  };
}

const titlesOf = (credits: { title?: string; name?: string }[]): (string | undefined)[] =>
  credits.map((c) => c.title ?? c.name);

describe("filmography extractors drop adult credits", () => {
  it("extractKnownForCredits omits adult cast and crew", () => {
    const result = extractKnownForCredits(
      [cast(1, "Clean Film", false), cast(2, "Adult Film", true)],
      [crew(3, "Clean Doc", false), crew(4, "Adult Doc", true)]
    );
    expect(titlesOf(result)).toEqual(["Clean Film", "Clean Doc"]);
  });

  it("extractUpcomingLatestCredits omits adult credits", () => {
    const result = extractUpcomingLatestCredits(
      [cast(1, "Clean Film", false), cast(2, "Adult Film", true)],
      [crew(3, "Clean Doc", false), crew(4, "Adult Doc", true)]
    );
    expect(titlesOf(result.cast)).toEqual(["Clean Film"]);
    expect(titlesOf(result.crew)).toEqual(["Clean Doc"]);
  });

  it("extractFilmographyCredits omits adult credits", () => {
    const result = extractFilmographyCredits(
      [cast(1, "Adult Film", true), cast(2, "Clean Film", false)],
      [crew(3, "Adult Doc", true), crew(4, "Clean Doc", false)]
    );
    expect(titlesOf(result.cast)).toEqual(["Clean Film"]);
    expect(titlesOf(result.crew)).toEqual(["Clean Doc"]);
  });

  it("filters BEFORE slicing, so an adult credit never eats a slot", () => {
    // Limit 1: the adult credit sorts first, so a filter-after-slice bug would
    // return an EMPTY list instead of the clean title.
    const result = extractFilmographyCredits(
      [cast(1, "Adult Film", true), cast(2, "Clean Film", false)],
      [],
      1,
      1
    );
    expect(titlesOf(result.cast)).toEqual(["Clean Film"]);
  });

  it("keeps a credit whose adult flag is absent (TMDB omits it on some TV credits)", () => {
    const missingFlag = cast(5, "Unflagged Show", false);
    // Simulate a TMDB payload with no `adult` key at all.
    delete (missingFlag as { adult?: boolean }).adult;
    const result = extractFilmographyCredits([missingFlag], []);
    expect(titlesOf(result.cast)).toEqual(["Unflagged Show"]);
  });
});
