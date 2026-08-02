import { describe, expect, it } from "vitest";

import { isMarkdownOnlyClient } from "./bot-detection";

/**
 * Regression tests for the proxy's markdown shed.
 *
 * The Aug 1 2026 incident: the shed fired on any `Accept` containing
 * `text/markdown`, so desktop Googlebot — which lists markdown alongside HTML —
 * was 429'd on every origin-bound request from Jul 29 (60-86k/day, all on HTML
 * paths). This bug class is invisible to typecheck and to every other test, so
 * the Googlebot case below is the one that matters most.
 */
describe("isMarkdownOnlyClient", () => {
  it("does NOT shed desktop Googlebot, which accepts markdown AND html", () => {
    const googlebotAccept =
      "text/html,application/xhtml+xml,application/xml;q=0.9,text/markdown;q=0.9,image/avif,image/webp,*/*;q=0.8";
    expect(isMarkdownOnlyClient(googlebotAccept)).toBe(false);
  });

  it("does NOT shed a normal browser", () => {
    expect(
      isMarkdownOnlyClient(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      ),
    ).toBe(false);
  });

  it("sheds a markdown-exclusive agent", () => {
    expect(isMarkdownOnlyClient("text/markdown")).toBe(true);
    expect(isMarkdownOnlyClient("text/markdown, */*;q=0.8")).toBe(true);
    expect(isMarkdownOnlyClient("text/plain, text/markdown")).toBe(true);
  });

  it("is case-insensitive (Accept values are not case-normalised upstream)", () => {
    expect(isMarkdownOnlyClient("TEXT/MARKDOWN")).toBe(true);
    expect(isMarkdownOnlyClient("TEXT/HTML, TEXT/MARKDOWN")).toBe(false);
  });

  it("ignores requests that never mention markdown", () => {
    expect(isMarkdownOnlyClient(null)).toBe(false);
    expect(isMarkdownOnlyClient("")).toBe(false);
    expect(isMarkdownOnlyClient("*/*")).toBe(false);
    expect(isMarkdownOnlyClient("application/json")).toBe(false);
  });
});
