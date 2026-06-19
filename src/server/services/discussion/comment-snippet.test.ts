import { describe, it, expect } from "vitest";
import { commentSnippet } from "./comment-snippet";

describe("commentSnippet", () => {
  it("returns plain text unchanged when short", () => {
    expect(commentSnippet("Loved this film.")).toBe("Loved this film.");
  });

  it("strips entity-mention tokens down to their visible label", () => {
    expect(commentSnippet("Best thing [[movie:603|The Matrix]] ever did")).toBe(
      "Best thing The Matrix ever did"
    );
  });

  it("removes hidden spoiler spans entirely (never leaks them in a teaser)", () => {
    const out = commentSnippet("The twist [spoiler]he was dead all along[/spoiler] floored me");
    expect(out).not.toContain("dead all along");
    expect(out).toContain("The twist");
    expect(out).toContain("floored me");
  });

  it("strips markdown emphasis/heading markers", () => {
    expect(commentSnippet("**Wow** _what_ a `scene` # big")).toBe("Wow what a scene big");
  });

  it("keeps markdown link text and drops the URL", () => {
    expect(commentSnippet("see [the review](https://example.com/x)")).toBe("see the review");
  });

  it("collapses bare URLs to a neutral marker", () => {
    expect(commentSnippet("watch https://youtu.be/abc now")).toBe("watch link now");
  });

  it("collapses newlines/whitespace to single spaces", () => {
    expect(commentSnippet("line one\n\nline   two")).toBe("line one line two");
  });

  it("truncates long bodies at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim();
    const out = commentSnippet(long, 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\sword?$/); // no dangling partial word before the ellipsis
  });
});
