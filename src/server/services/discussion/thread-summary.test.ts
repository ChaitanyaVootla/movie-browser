import { describe, it, expect } from "vitest";
import { filterSummaryInput, type SummaryInputComment } from "./thread-summary";
import { ANON_GATE_CONTEXT, type ViewerGateContext } from "./spoiler-gate";

const comments: SummaryInputComment[] = [
  {
    body: "loved the cinematography",
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PUBLISHED",
  },
  {
    body: "that S2E6 twist!!",
    spoilerScope: "EPISODE",
    scopeSeason: 2,
    scopeEpisode: 6,
    status: "PUBLISHED",
  },
  {
    body: "the ending broke me",
    spoilerScope: "ENDING",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PUBLISHED",
  },
  {
    body: "held for review",
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PENDING_REVIEW",
  },
];

describe("filterSummaryInput", () => {
  it("anon bucket gets only NONE + PUBLISHED", () => {
    const out = filterSummaryInput(comments, ANON_GATE_CONTEXT, "series");
    expect(out.map((c) => c.body)).toEqual(["loved the cinematography"]);
  });
  it("mid-watch viewer gets watermark-visible comments, never ENDING", () => {
    const ctx: ViewerGateContext = {
      loggedIn: true,
      movieWatched: false,
      seriesCompleted: false,
      maxSeason: 2,
      maxEpisode: 6,
    };
    const out = filterSummaryInput(comments, ctx, "series");
    expect(out.map((c) => c.body)).toEqual(["loved the cinematography", "that S2E6 twist!!"]);
  });
  it("non-PUBLISHED never feeds the summary, even when scope-visible", () => {
    const ctx: ViewerGateContext = {
      loggedIn: true,
      movieWatched: false,
      seriesCompleted: true,
      maxSeason: 9,
      maxEpisode: 9,
    };
    const out = filterSummaryInput(comments, ctx, "series");
    expect(out.some((c) => c.status !== "PUBLISHED")).toBe(false);
    expect(out).toHaveLength(3);
  });
});
