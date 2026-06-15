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
        entityMentions: [{ kind: "movie", tmdbId: 550, seasonNumber: null, episodeNumber: null, name: "Fight Club", href: "/movie/550/fight-club", imagePath: null }],
      })} />
    );
    expect(html).toContain('href="/movie/550/fight-club"');
    expect(html).toContain("Fight Club"); // CURRENT catalog name, not the stored label
  });
  it("renders a mention INLINE — text + mention flow on one line, no block break (issue 2)", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "hi @bea nice" })} />);
    // The text segments must NOT be wrapped in block elements: a block <p> or a
    // block <span> per text segment forces the mention onto its own line — the
    // user-reported "newline after @mention" bug. They must render inline.
    expect(html).not.toContain("<p>");
    expect(html).not.toContain('class="block'); // no per-segment block wrapper
    expect(html).toContain('href="/u/bea"');
    // Both surrounding words are present and the boundary whitespace around the
    // mention is preserved (so words never glue onto the chip).
    expect(html).toContain(">hi<");
    expect(html).toContain(">nice<");
    expect(html).toContain("</span> "); // trailing space after "hi" before the link
    expect(html).toMatch(/> <span/); // leading space token before the "nice" segment
  });
  it("preserves both paragraphs' content for a two-paragraph body (inline, no lost text)", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "first para\n\nsecond para" })} />);
    // Inline rendering keeps text + mentions on one line (issue 2); authored
    // newlines are preserved by the container's whitespace-pre-wrap. The key
    // invariant is no content loss and no per-segment block wrapper.
    expect(html).toContain("first para");
    expect(html).toContain("second para");
    expect(html).not.toContain("<p>");
  });
  it("hides a [spoiler] body until revealed (renders a button, not the text in plain flow)", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "the killer is [spoiler]Bob[/spoiler]" })} />);
    expect(html).toContain("Reveal spoiler");
  });
});
