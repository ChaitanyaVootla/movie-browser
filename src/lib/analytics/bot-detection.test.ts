import { describe, expect, it } from "vitest";

import {
  isForgedBrowserPersona,
  isForgedOriginReferer,
  isMarkdownOnlyClient,
  isVerifiedBot,
  verifiedBotCategory,
} from "./bot-detection";

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

/**
 * Cloudflare verified-bot identity (Aug 2026).
 *
 * `cf.client.bot` is the first signal this codebase has ever had that a crawler
 * is genuinely who its User-Agent claims — Cloudflare verifies by reverse DNS
 * and published IP ranges. It reaches the origin as `X-Verified-Bot` via a
 * request-header Transform Rule, because Cloudflare exposes it only as a ruleset
 * field. CloudFront had no equivalent, which is precisely why the Aug 2 2026
 * incident (a heuristic 429'd real Googlebot for three days, GSC clicks
 * 620 -> 262) was possible at all.
 *
 * The shed ordering these enable is asserted in proxy-shed-order.test.ts.
 */
describe("isVerifiedBot / verifiedBotCategory", () => {
  it("is FALSE when the header is absent, so it stays inert behind CloudFront", () => {
    expect(isVerifiedBot(new Headers())).toBe(false);
    expect(verifiedBotCategory(new Headers())).toBeNull();
  });

  it("recognises Cloudflare's verified-bot flag", () => {
    expect(isVerifiedBot(new Headers({ "x-verified-bot": "true" }))).toBe(true);
  });

  it("treats anything other than an exact 'true' as unverified", () => {
    // to_string(cf.client.bot) yields exactly "true"/"false". Anything else is
    // a forged header and must NOT buy a shed exemption.
    for (const v of ["false", "1", "TRUE", "yes", "", " true"]) {
      expect(isVerifiedBot(new Headers({ "x-verified-bot": v })), v).toBe(false);
    }
  });

  it("exposes the verified category and trims it", () => {
    expect(
      verifiedBotCategory(new Headers({ "x-verified-bot-category": " Search Engine Crawler " })),
    ).toBe("Search Engine Crawler");
    expect(verifiedBotCategory(new Headers({ "x-verified-bot-category": "" }))).toBeNull();
  });
});

describe("isForgedBrowserPersona", () => {
  const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
  const EDGE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0";
  const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36";
  const FF_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0";
  const PRE_SXG_ACCEPT =
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
  const REAL_CHROME_ACCEPT = `${PRE_SXG_ACCEPT},application/signed-exchange;v=b3;q=0.7`;
  const FF_2018_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const FF_REAL_ACCEPT =
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8";
  const NAV = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

  const headers = (h: Record<string, string>) => ({
    get: (name: string) => h[name.toLowerCase()] ?? null,
  });

  it("sheds the CN fleet's Chrome persona: modern Chrome UA with the pre-SXG Accept (captured Sep 15 2026)", () => {
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent": CHROME_UA,
          accept: PRE_SXG_ACCEPT,
          "sec-ch-ua": '"Chromium";v="144", "Google Chrome";v="144", "Not.A/Brand";v="99"',
          "upgrade-insecure-requests": "1",
          "accept-language": "zh-CN,zh;q=0.9",
        })
      )
    ).toBe("forged_chromium");
    expect(isForgedBrowserPersona(headers({ ...NAV, "user-agent": EDGE_UA, accept: PRE_SXG_ACCEPT }))).toBe(
      "forged_chromium"
    );
  });

  it("serves real desktop Chrome and Edge (signed-exchange present)", () => {
    expect(isForgedBrowserPersona(headers({ ...NAV, "user-agent": CHROME_UA, accept: REAL_CHROME_ACCEPT }))).toBeNull();
    expect(isForgedBrowserPersona(headers({ ...NAV, "user-agent": EDGE_UA, accept: REAL_CHROME_ACCEPT }))).toBeNull();
  });

  it("never matches non-navigations: RSC/prefetch (cors), subresources, or requests without Sec-Fetch", () => {
    expect(
      isForgedBrowserPersona(
        headers({ "user-agent": CHROME_UA, accept: "*/*", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" })
      )
    ).toBeNull();
    expect(
      isForgedBrowserPersona(
        headers({
          "user-agent": CHROME_UA,
          accept: "image/avif,image/webp,*/*",
          "sec-fetch-mode": "no-cors",
          "sec-fetch-dest": "image",
        })
      )
    ).toBeNull();
    // No Sec-Fetch headers at all (Googlebot, unfurlers, curl) — can never match.
    expect(isForgedBrowserPersona(headers({ "user-agent": CHROME_UA, accept: PRE_SXG_ACCEPT }))).toBeNull();
  });

  it("excludes browsers we do not assert SXG for: Brave, mobile/WebView, Opera, pre-100 Chrome, declared bots", () => {
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent": CHROME_UA,
          accept: PRE_SXG_ACCEPT,
          "sec-ch-ua": '"Brave";v="144", "Chromium";v="144"',
        })
      )
    ).toBeNull();
    expect(isForgedBrowserPersona(headers({ ...NAV, "user-agent": ANDROID_UA, accept: PRE_SXG_ACCEPT }))).toBeNull();
    expect(
      isForgedBrowserPersona(headers({ ...NAV, "user-agent": `${CHROME_UA} OPR/130.0.0.0`, accept: PRE_SXG_ACCEPT }))
    ).toBeNull();
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
          accept: PRE_SXG_ACCEPT,
        })
      )
    ).toBeNull();
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent":
            "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/144.0.0.0 Safari/537.36",
          accept: PRE_SXG_ACCEPT,
        })
      )
    ).toBeNull();
  });

  it("sheds the 24/7 Firefox 151 persona: 2018 Accept AND no Upgrade-Insecure-Requests", () => {
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent": FF_UA,
          accept: FF_2018_ACCEPT,
          "accept-language": "en-US,en;q=0.5",
          priority: "u=0, i",
        })
      )
    ).toBe("forged_firefox");
  });

  it("serves real Firefox, and Firefox with only ONE of the two tells missing", () => {
    expect(
      isForgedBrowserPersona(
        headers({ ...NAV, "user-agent": FF_UA, accept: FF_REAL_ACCEPT, "upgrade-insecure-requests": "1" })
      )
    ).toBeNull();
    expect(
      isForgedBrowserPersona(
        headers({ ...NAV, "user-agent": FF_UA, accept: FF_2018_ACCEPT, "upgrade-insecure-requests": "1" })
      )
    ).toBeNull();
    expect(isForgedBrowserPersona(headers({ ...NAV, "user-agent": FF_UA, accept: FF_REAL_ACCEPT }))).toBeNull();
    // Firefox 60 predates image/webp in Accept — a legitimately old browser.
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:60.0) Gecko/20100101 Firefox/60.0",
          accept: FF_2018_ACCEPT,
        })
      )
    ).toBeNull();
  });

  it("ignores Safari and empty UAs", () => {
    expect(
      isForgedBrowserPersona(
        headers({
          ...NAV,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
          accept: FF_2018_ACCEPT,
        })
      )
    ).toBeNull();
    expect(isForgedBrowserPersona(headers({ ...NAV, accept: PRE_SXG_ACCEPT }))).toBeNull();
  });
});
