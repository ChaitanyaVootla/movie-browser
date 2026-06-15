import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichTextBody } from "./rich-text-body";
import type { EntityMentionRef } from "@/server/db/postgres/comments";

describe("RichTextBody", () => {
  it("renders markdown-lite (bold) without raw HTML", () => {
    const html = renderToStaticMarkup(<RichTextBody body="this is **bold**" />);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script");
  });
  it("renders @user as a profile link", () => {
    const html = renderToStaticMarkup(<RichTextBody body="hi @bea" />);
    expect(html).toContain('href="/u/bea"');
  });
  it("renders an entity token as a live link with current name", () => {
    const mentions: EntityMentionRef[] = [
      { kind: "movie", tmdbId: 550, seasonNumber: null, episodeNumber: null, name: "Fight Club", href: "/movie/550/fight-club", imagePath: null },
    ];
    const html = renderToStaticMarkup(
      <RichTextBody body="see [[movie:550|Old Name]]" entityMentions={mentions} />
    );
    expect(html).toContain('href="/movie/550/fight-club"');
    expect(html).toContain("Fight Club"); // CURRENT catalog name, not the stored label
  });
  it("falls back to the stored label when no mention ref is supplied", () => {
    const html = renderToStaticMarkup(<RichTextBody body="see [[movie:550|Old Name]]" />);
    expect(html).toContain("Old Name");
  });
  it("renders a mention INLINE — text + mention flow on one line, no block break (issue 2)", () => {
    const html = renderToStaticMarkup(<RichTextBody body="hi @bea nice" />);
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
    const html = renderToStaticMarkup(<RichTextBody body="first para\n\nsecond para" />);
    expect(html).toContain("first para");
    expect(html).toContain("second para");
    expect(html).not.toContain("<p>");
  });
  it("hides a [spoiler] body until revealed (renders a button, not the text in plain flow)", () => {
    const html = renderToStaticMarkup(<RichTextBody body="the killer is [spoiler]Bob[/spoiler]" />);
    expect(html).toContain("Reveal spoiler");
  });
  it("shows the deleted notice for a DELETED_BY_USER status", () => {
    const html = renderToStaticMarkup(<RichTextBody body="gone" status="DELETED_BY_USER" />);
    expect(html).toContain("Deleted by author");
  });
});
