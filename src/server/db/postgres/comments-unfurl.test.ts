import { describe, it, expect } from "vitest";
import { attachLinkCards, type LinkCardLite } from "./comments";
import type { CommentDto } from "./comments";

function dto(id: number, body: string): CommentDto {
  return {
    id,
    parentId: null,
    body,
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PUBLISHED",
    likeCount: 0,
    createdAt: "2026-06-15T00:00:00.000Z",
    editedAt: null,
    author: null,
    attachment: null,
    viewerLiked: false,
    entityMentions: [],
    linkCard: null,
  };
}

describe("attachLinkCards", () => {
  it("attaches a cached card to the comment whose first link matches", () => {
    const comments = [dto(1, "see https://example.com/a"), dto(2, "no link")];
    const cards = new Map<string, LinkCardLite>([
      [
        "https://example.com/a",
        {
          url: "https://example.com/a",
          domain: "example.com",
          status: "OK",
          provider: "GENERIC",
          title: "Ex",
          description: null,
          imageUrl: null,
          faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
          youtubeId: null,
        },
      ],
    ]);
    const result = attachLinkCards(comments, cards);
    expect(result[0].linkCard?.title).toBe("Ex");
    expect(result[1].linkCard).toBeNull();
  });
  it("leaves linkCard null when no cached row exists (no refetch on render)", () => {
    const comments = [dto(1, "see https://uncached.com/a")];
    const result = attachLinkCards(comments, new Map());
    expect(result[0].linkCard).toBeNull();
  });
});
