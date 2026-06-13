import { describe, expect, it } from "vitest";
import {
  episodeCode,
  episodeKey,
  groupDiaryByMonth,
  isValidUsername,
  normalizeUsername,
} from "./tracking-format";
import type { DiaryEntryDTO } from "@/types/social";

function entry(id: number, watchedAt: string | null): DiaryEntryDTO {
  return {
    id,
    mediaType: "movie",
    tmdbId: id,
    title: `Movie ${id}`,
    posterPath: null,
    seasonNumber: null,
    episodeNumber: null,
    episodeName: null,
    watchedAt,
    watchedAtPrecision: watchedAt ? "DATE" : "UNKNOWN",
    note: null,
    isRewatch: false,
    isPrivate: false,
    source: "LOGGED",
  };
}

describe("episode helpers", () => {
  it("formats codes and keys", () => {
    expect(episodeCode(3, 4)).toBe("S3E4");
    expect(episodeKey(3, 4)).toBe("3:4");
  });
});

describe("groupDiaryByMonth", () => {
  it("groups consecutive months and skips undated entries", () => {
    const groups = groupDiaryByMonth([
      entry(1, "2026-06-10T12:00:00Z"),
      entry(2, "2026-06-01T12:00:00Z"),
      entry(3, null),
      entry(4, "2026-05-20T12:00:00Z"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-06", "2026-05"]);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].entries).toHaveLength(1);
  });
});

describe("username validation", () => {
  it("accepts valid and rejects invalid usernames", () => {
    expect(isValidUsername("film_fan99")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("Has-Caps")).toBe(false);
    expect(normalizeUsername("  FilmFan ")).toBe("filmfan");
  });
});
