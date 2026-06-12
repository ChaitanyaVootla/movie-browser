import { describe, it, expect } from "vitest";
import { parseLetterboxdExport } from "./letterboxd";

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-01-05,Heat,1995,https://boxd.it/a1,4.5,,crime,2026-01-04
2026-02-01,Heat,1995,https://boxd.it/a2,5,Yes,"crime, rewatch club",2026-01-31
`;

const WATCHED = `Date,Name,Year,Letterboxd URI
2026-01-05,Heat,1995,https://boxd.it/a1
2024-03-02,Se7en,1995,https://boxd.it/b1
`;

const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2026-01-05,Heat,1995,https://boxd.it/a1,4.5
`;

const REVIEWS = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2026-01-05,Heat,1995,https://boxd.it/a1,4.5,,"Pacino vs De Niro.
Still perfect.",crime,2026-01-04
`;

const LIKES = `Date,Name,Year,Letterboxd URI
2026-01-06,Se7en,1995,https://boxd.it/b1
`;

const WATCHLIST = `Date,Name,Year,Letterboxd URI
2026-01-07,Ronin,1998,https://boxd.it/c1
`;

const LIST = `Letterboxd list export v7
Date,Name,Tags,URL,Description
2026-01-08,Crime Essentials,,https://boxd.it/list1,The hard stuff

Position,Name,Year,URL,Description
1,Heat,1995,https://boxd.it/a1,
2,Se7en,1995,https://boxd.it/b1,
`;

function files(extra: Record<string, string> = {}): Map<string, string> {
  return new Map(
    Object.entries({
      "diary.csv": DIARY,
      "watched.csv": WATCHED,
      "ratings.csv": RATINGS,
      "reviews.csv": REVIEWS,
      "likes/films.csv": LIKES,
      "watchlist.csv": WATCHLIST,
      "lists/crime-essentials.csv": LIST,
      ...extra,
    })
  );
}

describe("parseLetterboxdExport", () => {
  it("diary rows become DATE-precision watches with rewatch/tags/note-less", () => {
    const out = parseLetterboxdExport(files());
    const heatWatches = out.watches.filter((w) => w.ref.title === "Heat");
    expect(heatWatches).toHaveLength(2);
    expect(heatWatches[0]).toMatchObject({
      watchedAt: "2026-01-04",
      precision: "DATE",
      isRewatch: false,
      tags: ["crime"],
    });
    expect(heatWatches[1]).toMatchObject({
      watchedAt: "2026-01-31",
      isRewatch: true,
      tags: ["crime", "rewatch club"],
    });
  });

  it("watched.csv adds DATELESS watches only for films absent from the diary", () => {
    const out = parseLetterboxdExport(files());
    const se7en = out.watches.filter((w) => w.ref.title === "Se7en");
    expect(se7en).toHaveLength(1);
    expect(se7en[0]).toMatchObject({ watchedAt: null, precision: "UNKNOWN" });
    // Heat is in the diary -> no extra dateless row
    expect(out.watches.filter((w) => w.ref.title === "Heat")).toHaveLength(2);
  });

  it("ratings: 0.5-5 stars -> score = stars*2; likes -> thumb up", () => {
    const out = parseLetterboxdExport(files());
    const heat = out.ratings.find((r) => r.ref.title === "Heat");
    expect(heat).toMatchObject({ score: 9, ratedAt: "2026-01-05" });
    const like = out.ratings.find((r) => r.ref.title === "Se7en");
    expect(like).toMatchObject({ thumb: 1, score: null });
  });

  it("reviews keep multiline bodies and the watched date for diary linkage", () => {
    const out = parseLetterboxdExport(files());
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0].body).toBe("Pacino vs De Niro.\nStill perfect.");
    expect(out.reviews[0].watchedAt).toBe("2026-01-04");
  });

  it("watchlist and lists parse with positions", () => {
    const out = parseLetterboxdExport(files());
    expect(out.watchlist[0].ref.title).toBe("Ronin");
    expect(out.lists).toHaveLength(1);
    expect(out.lists[0].name).toBe("Crime Essentials");
    expect(out.lists[0].items.map((i) => i.ref.title)).toEqual(["Heat", "Se7en"]);
  });

  it("rows without a usable name are counted as unmappable, never dropped silently", () => {
    const out = parseLetterboxdExport(
      files({ "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-05,,1995,u,,,,\n" })
    );
    expect(out.unmappable.some((u) => u.file === "diary.csv")).toBe(true);
  });
});
