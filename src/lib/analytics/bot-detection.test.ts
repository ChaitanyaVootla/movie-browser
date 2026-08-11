import { describe, expect, it } from "vitest";

import { isForgedOriginReferer, isMarkdownOnlyClient } from "./bot-detection";

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

/**
 * Regression tests for the forged-origin-referer shed (Aug 11 2026 incident).
 *
 * The whole rule rests on ONE fact: the WHATWG URL serializer always emits a
 * "/" for a URL whose path is empty, so every referer a real user agent sends
 * has at least a "/" after the authority. A path-LESS referer is hand-built.
 *
 * Measured on prod before shipping (7d/30d windows), and the reason this is
 * safe to 429 rather than merely label:
 *   - `https://themoviebrowser.com` (no slash): 2,192,483 views across
 *     2,002,073 sessions with **0 authenticated** — ~1.09 views/session.
 *   - `https://themoviebrowser.com/` (with slash): 4,119 views, 118 authed.
 *   - Every other origin-only referer on the site (Bing, DuckDuckGo, Google,
 *     Baidu, Yandex, Yahoo, Brave, Ecosia, our own www/http variants) carries
 *     the trailing slash. The fleet was the ONLY path-less row.
 *   - Against 1,099 CONFIRMED human sessions over 30 days (authenticated or
 *     having performed a tracked action): 0 sessions and 0 of 54,736 views
 *     would be shed.
 *
 * The Aug 2 2026 Googlebot incident is why the FP cases below are pinned first:
 * a shed predicate that over-matches a crawler is invisible to typecheck and
 * costs weeks of search traffic. Googlebot sends NO referer at all.
 */
describe("isForgedOriginReferer", () => {
  it("does NOT shed a referer-less request (Googlebot, direct navigation, unfurl bots)", () => {
    expect(isForgedOriginReferer(null)).toBe(false);
    expect(isForgedOriginReferer("")).toBe(false);
  });

  it("does NOT shed a real origin-only referer — browsers always emit the slash", () => {
    // Every one of these was measured on prod carrying the trailing slash.
    expect(isForgedOriginReferer("https://themoviebrowser.com/")).toBe(false);
    expect(isForgedOriginReferer("https://www.bing.com/")).toBe(false);
    expect(isForgedOriginReferer("https://duckduckgo.com/")).toBe(false);
    expect(isForgedOriginReferer("https://www.google.com/")).toBe(false);
    expect(isForgedOriginReferer("http://www.baidu.com/")).toBe(false);
    expect(isForgedOriginReferer("https://origin.themoviebrowser.com/")).toBe(false);
  });

  it("does NOT shed a referer that carries a path (same-origin navigation)", () => {
    expect(isForgedOriginReferer("https://themoviebrowser.com/movie/157336/interstellar")).toBe(
      false,
    );
    expect(isForgedOriginReferer("https://www.google.com/search?q=movies")).toBe(false);
  });

  it("sheds the path-less referer the fleet sends", () => {
    expect(isForgedOriginReferer("https://themoviebrowser.com")).toBe(true);
    // Host-agnostic on purpose: the Jul 2026 fleet rotated providers within a
    // day, so pinning our own host would just move the forgery elsewhere.
    expect(isForgedOriginReferer("https://www.google.com")).toBe(true);
    expect(isForgedOriginReferer("http://themoviebrowser.com")).toBe(true);
    expect(isForgedOriginReferer("https://themoviebrowser.com:443")).toBe(true);
  });

  it("sheds a path-less referer that still carries a query (no slash = forged)", () => {
    // A browser would serialise this as `https://example.com/?a=b`.
    expect(isForgedOriginReferer("https://example.com?a=b")).toBe(true);
  });

  it("fails OPEN on anything it cannot confidently parse", () => {
    // Never 429 on a malformed or unexpected referer — the cost of a false
    // positive here is a blocked human, the cost of a miss is one render.
    expect(isForgedOriginReferer("not a url")).toBe(false);
    expect(isForgedOriginReferer("/relative/path")).toBe(false);
    expect(isForgedOriginReferer("android-app://com.example")).toBe(false);
    expect(isForgedOriginReferer("https://")).toBe(false);
    expect(isForgedOriginReferer("about:blank")).toBe(false);
  });

  it("is tolerant of surrounding whitespace", () => {
    expect(isForgedOriginReferer("  https://themoviebrowser.com  ")).toBe(true);
    expect(isForgedOriginReferer("  https://themoviebrowser.com/  ")).toBe(false);
  });
});
