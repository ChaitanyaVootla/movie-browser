import { describe, it, expect } from "vitest";
import { sanitizeCommentBody } from "./sanitize-comment";

describe("sanitizeCommentBody", () => {
  it("preserves plain markdown-lite text", () => {
    expect(sanitizeCommentBody("**bold** and _italic_ and a [spoiler]reveal[/spoiler]"))
      .toBe("**bold** and _italic_ and a [spoiler]reveal[/spoiler]");
  });
  it("strips raw HTML tags entirely (no dangerous markup survives to render)", () => {
    expect(sanitizeCommentBody('hi <script>alert(1)</script> there')).toBe("hi  there");
    expect(sanitizeCommentBody('<img src=x onerror=alert(1)>caption')).toBe("caption");
  });
  it("neutralizes javascript: protocol inside markdown link text", () => {
    // markdown is rendered by react-markdown later; sanitize removes raw HTML only,
    // but a literal <a href="javascript:..."> must not survive.
    expect(sanitizeCommentBody('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });
  it("collapses to empty when only markup", () => {
    expect(sanitizeCommentBody("<div></div>")).toBe("");
  });
});
