import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentBody } from "./comment-body";
import type { CommentDto } from "@/server/db/postgres/comments";

const dto = (over: Partial<CommentDto>): CommentDto => ({
  id: 1, parentId: null, body: "", spoilerScope: "NONE", scopeSeason: null, scopeEpisode: null,
  status: "PUBLISHED", likeCount: 0, createdAt: "2026-06-15T00:00:00Z", editedAt: null,
  author: { id: 1, username: "ada", name: "Ada", image: null }, attachment: null,
  viewerLiked: false, entityMentions: [], linkCard: null, ...over,
});

describe("CommentBody", () => {
  it("renders markdown-lite (bold) without raw HTML", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "this is **bold**" })} />);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script");
  });
  it("renders @user as a profile link", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "hi @bea" })} />);
    expect(html).toContain('href="/u/bea"');
  });
  it("renders an entity token as a live link with current name", () => {
    const html = renderToStaticMarkup(
      <CommentBody comment={dto({
        body: "see [[movie:550|Old Name]]",
        entityMentions: [{ kind: "movie", tmdbId: 550, seasonNumber: null, episodeNumber: null, name: "Fight Club", href: "/movie/550/fight-club" }],
      })} />
    );
    expect(html).toContain('href="/movie/550/fight-club"');
    expect(html).toContain("Fight Club"); // CURRENT catalog name, not the stored label
  });
  it("hides a [spoiler] body until revealed (renders a button, not the text in plain flow)", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "the killer is [spoiler]Bob[/spoiler]" })} />);
    expect(html).toContain("Reveal spoiler");
  });
});
