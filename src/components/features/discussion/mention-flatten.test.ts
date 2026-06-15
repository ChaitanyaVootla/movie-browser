import { describe, it, expect } from "vitest";
import { flattenMentionResults, mentionToToken } from "@/components/features/rich-text";
import type { MentionSearchResultDto } from "@/types/social";

describe("flattenMentionResults → mention node attrs", () => {
  const dto: MentionSearchResultDto = {
    people: [{ username: "bea", name: "Bea", image: "https://x/avatar.png" }],
    titles: [
      { kind: "movie", tmdbId: 550, name: "Fight Club", year: 1999, imagePath: "/p.jpg" },
      { kind: "series", tmdbId: 1396, name: "Breaking Bad", year: 2008, imagePath: null },
    ],
    cast: [{ tmdbId: 287, name: "Brad Pitt", imagePath: "/bp.jpg" }],
    episodes: [{ seriesId: 1396, seasonNumber: 5, episodeNumber: 14, name: "Ozymandias", imagePath: "/o.jpg" }],
  };

  it("produces ordered sections People → Titles → Cast → Episodes", () => {
    const items = flattenMentionResults(dto);
    expect(items.map((i) => i.section)).toEqual(["People", "Titles", "Titles", "Cast / People", "Episodes"]);
  });

  it("each item's attrs serialize to the exact backend token", () => {
    const items = flattenMentionResults(dto);
    const tokens = items.map((i) => mentionToToken(i.attrs));
    expect(tokens).toEqual([
      "@bea",
      "[[movie:550|Fight Club]]",
      "[[series:1396|Breaking Bad]]",
      "[[person:287|Brad Pitt]]",
      "[[ep:1396:5:14|Ozymandias]]",
    ]);
  });

  it("carries season/episode on episode items for the natural-key token", () => {
    const ep = flattenMentionResults(dto).find((i) => i.attrs.kind === "episode");
    expect(ep?.attrs.season).toBe(5);
    expect(ep?.attrs.episode).toBe(14);
    expect(ep?.attrs.id).toBe("1396"); // SERIES id, not an episode pk
  });

  it("null result → empty list", () => {
    expect(flattenMentionResults(null)).toEqual([]);
  });
});
