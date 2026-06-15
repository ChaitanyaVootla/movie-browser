import { describe, it, expect } from "vitest";
import {
  HUB_HOT_WINDOW_MS,
  hotWindowStart,
  hubBaseWhere,
  toHubThreadCard,
  type HubCommentRow,
} from "./discussion-hub";

describe("discussion-hub where-builders", () => {
  it("hot window start is 72h before now", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(hotWindowStart(now).toISOString()).toBe("2026-06-12T00:00:00.000Z");
    expect(HUB_HOT_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("hubBaseWhere bakes circleId:null + PUBLISHED + NONE-scope + root-only (anon-cacheable tier)", () => {
    const w = hubBaseWhere();
    expect(w.circleId).toBeNull();
    expect(w.status).toBe("PUBLISHED");
    expect(w.spoilerScope).toBe("NONE");
    expect(w.parentId).toBeNull();
  });
});

describe("toHubThreadCard", () => {
  const baseRow: HubCommentRow = {
    id: 7,
    body: "What did everyone think of the finale framing?",
    likeCount: 3,
    createdAt: new Date("2026-06-14T10:00:00Z"),
    movieId: 603,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    user: { id: 42, username: "ada", name: "Ada", image: null, isCue: false },
    movie: { id: 603, title: "The Matrix", posterPath: "/m.jpg" },
    series: null,
  };

  it("maps a movie-anchored row to a movie hub card with a /movie permalink", () => {
    const card = toHubThreadCard(baseRow);
    expect(card.anchor).toEqual({ type: "movie", title: "The Matrix", posterPath: "/m.jpg" });
    expect(card.href).toBe("/movie/603/discussions");
    expect(card.isCue).toBe(false);
  });

  it("maps a series-anchored row to a series hub card", () => {
    const card = toHubThreadCard({
      ...baseRow,
      movieId: null,
      movie: null,
      seriesId: 1396,
      series: { id: 1396, name: "Breaking Bad", posterPath: "/bb.jpg" },
    });
    expect(card.anchor).toEqual({ type: "series", title: "Breaking Bad", posterPath: "/bb.jpg" });
    expect(card.href).toBe("/series/1396/discussions");
  });

  it("flags a Cue-authored card", () => {
    const card = toHubThreadCard({
      ...baseRow,
      user: { id: 1, username: "cue", name: "Cue", image: null, isCue: true },
    });
    expect(card.isCue).toBe(true);
    expect(card.author.username).toBe("cue");
  });
});
