import { describe, expect, it } from "vitest";
import type { ReviewDTO } from "@/types/social";
import { dedupeById } from "./dedupe-reviews";

/**
 * Light unit coverage for the one pure helper in the reviews-client island
 * (de-duping the SSR seed against later loadReviews pages). The island itself
 * (tabs/session/infinite-scroll/spoiler-reveal) is integration-tested in a real
 * browser per the spec — jsdom can't meaningfully exercise next-auth + server
 * actions, so it is intentionally not unit-tested here.
 */
function review(id: number): ReviewDTO {
  return {
    id,
    username: null,
    displayName: "Member",
    avatarUrl: null,
    avatarCrop: null,
    title: null,
    score: null,
    liked: false,
    body: "b",
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    images: [],
    seasonNumber: null,
    likeCount: 0,
    likedByViewer: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    editedAt: null,
  };
}

describe("dedupeById", () => {
  it("keeps the first occurrence of each id and drops later duplicates", () => {
    const out = dedupeById([review(1), review(2), review(1), review(3), review(2)]);
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("preserves order (SSR seed before loaded page)", () => {
    const seed = [review(10), review(11)];
    const loaded = [review(11), review(12)]; // 11 overlaps the seed
    const out = dedupeById([...seed, ...loaded]);
    expect(out.map((r) => r.id)).toEqual([10, 11, 12]);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeById([])).toEqual([]);
  });
});
