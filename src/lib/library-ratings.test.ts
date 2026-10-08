import { describe, it, expect } from "vitest";
import {
  buildRatingsPayload,
  countRatings,
  matchesRatingFilter,
  sortRatedTitles,
  thumbLabel,
  type RatedTitle,
} from "./library-ratings";

const d = (iso: string) => new Date(iso);
const movie = (id: number, title: string, release_date = "2020-01-01") => ({
  id,
  title,
  release_date,
  poster_path: null,
  backdrop_path: null,
  vote_average: 7,
  genres: [{ id: 18, name: "Drama" }],
});
const show = (id: number, name: string) => ({
  id,
  name,
  first_air_date: "2010-01-01",
  poster_path: null,
  backdrop_path: null,
  vote_average: null,
  genres: [],
});

describe("buildRatingsPayload", () => {
  it("joins rows to details in row order, keeping score / heart / thumb", () => {
    const payload = buildRatingsPayload(
      [
        { itemId: 1, itemType: "movie", thumb: null, score: 7, liked: true, ratedAt: d("2026-10-01") },
        { itemId: 9, itemType: "series", thumb: 1, score: null, liked: false, ratedAt: d("2026-09-01") },
        { itemId: 2, itemType: "movie", thumb: null, score: null, liked: true, ratedAt: d("2026-08-01") },
      ],
      [movie(1, "Heat"), movie(2, "Up")],
      [show(9, "Lost")]
    );
    expect(payload.totalCount).toBe(3);
    expect(payload.items.map((i) => [i.mediaType, i.id, i.title])).toEqual([
      ["movie", 1, "Heat"],
      ["series", 9, "Lost"],
      ["movie", 2, "Up"],
    ]);
    expect(payload.items[0]).toMatchObject({ score: 7, liked: true, thumb: null });
    expect(payload.items[1]).toMatchObject({ thumb: 1, score: null, vote_average: 0, date: "2010-01-01" });
    expect(payload.items[2]).toMatchObject({ liked: true, score: null });
  });

  it("does not confuse a movie and a series with the same id, and drops missing titles", () => {
    const payload = buildRatingsPayload(
      [
        { itemId: 5, itemType: "series", thumb: -1, score: null, liked: false, ratedAt: d("2026-01-02") },
        { itemId: 6, itemType: "movie", thumb: 1, score: null, liked: false, ratedAt: d("2026-01-01") },
      ],
      [movie(5, "A Movie")],
      [show(5, "A Show")]
    );
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ mediaType: "series", title: "A Show", thumb: -1 });
  });

  it("sanitizes out-of-range values", () => {
    const payload = buildRatingsPayload(
      [{ itemId: 1, itemType: "movie", thumb: 5, score: 11, liked: false, ratedAt: d("2026-01-01") }],
      [movie(1, "X")],
      []
    );
    expect(payload.items[0]).toMatchObject({ thumb: null, score: null });
  });
});

function item(over: Partial<RatedTitle>): RatedTitle {
  return {
    mediaType: "movie",
    id: 1,
    title: "T",
    poster_path: null,
    backdrop_path: null,
    vote_average: 5,
    date: "2000-01-01",
    genres: [],
    ratedAt: "2026-01-01T00:00:00.000Z",
    thumb: null,
    score: null,
    liked: false,
    ...over,
  };
}

describe("filters, counts, sort, labels", () => {
  const items = [
    item({ id: 1, score: 9, title: "B" }),
    item({ id: 2, liked: true, title: "A" }),
    item({ id: 3, thumb: 1, title: "C" }),
    item({ id: 4, thumb: -1, score: 4, title: "D" }),
    item({ id: 5, mediaType: "series", score: 6, liked: true, title: "E" }),
  ];

  it("filters by signal", () => {
    const ids = (f: Parameters<typeof matchesRatingFilter>[1]) =>
      items.filter((i) => matchesRatingFilter(i, f)).map((i) => i.id);
    expect(ids("all")).toEqual([1, 2, 3, 4, 5]);
    expect(ids("scored")).toEqual([1, 4, 5]);
    expect(ids("loved")).toEqual([2, 5]);
    expect(ids("likes")).toEqual([3]);
    expect(ids("dislikes")).toEqual([4]);
  });

  it("counts per media type and filter", () => {
    const c = countRatings(items);
    expect(c.movie).toEqual({ all: 4, scored: 2, loved: 1, likes: 1, dislikes: 1 });
    expect(c.series).toEqual({ all: 1, scored: 1, loved: 1, likes: 0, dislikes: 0 });
  });

  it("'score' sorts your score high→low, unscored last (loved first among them)", () => {
    expect(sortRatedTitles(items, "score").map((i) => i.id)).toEqual([1, 5, 4, 2, 3]);
    expect(sortRatedTitles(items, "title").map((i) => i.title)).toEqual(["A", "B", "C", "D", "E"]);
    // non-mutating
    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("labels thumbs only", () => {
    expect(thumbLabel(item({ thumb: 1 }))).toBe("Liked");
    expect(thumbLabel(item({ thumb: -1 }))).toBe("Disliked");
    expect(thumbLabel(item({ score: 8 }))).toBeUndefined();
  });
});
