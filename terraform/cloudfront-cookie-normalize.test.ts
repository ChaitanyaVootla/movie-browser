import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Tests the CloudFront viewer-request Function.
 *
 * It is loaded and evaluated from the .js file ON DISK so these assertions
 * exercise the ACTUAL artifact Terraform uploads — a copy of the logic here
 * would drift and prove nothing.
 *
 * Why this file is worth testing at all: the function is the FIRST thing every
 * request touches, and a 429 it emits never reaches Next, so a mistake is
 * invisible to every other test AND to analytics (no page_view row is written).
 * That is exactly how the Aug 2 2026 LinkedIn outage stayed hidden.
 */

type CfHeaders = Record<string, { value: string }>;
interface CfRequest {
  headers: CfHeaders;
}
interface CfResponse {
  statusCode?: number;
  headers?: CfHeaders;
}

const source = readFileSync(join(__dirname, "cloudfront-cookie-normalize.js"), "utf8");
// The file is a bare ES5 script declaring `function handler(event)`; evaluate it
// and hand back the symbol. Runtime is cloudfront-js-2.0, so no module system.
const handler = new Function(`${source}; return handler;`)() as (event: {
  request: CfRequest;
}) => CfRequest | CfResponse;

function request(ua?: string, cookie?: string): CfRequest {
  const headers: CfHeaders = {};
  if (ua !== undefined) headers["user-agent"] = { value: ua };
  if (cookie !== undefined) headers.cookie = { value: cookie };
  return { headers };
}

function statusOf(ua: string): number | undefined {
  return (handler({ request: request(ua) }) as CfResponse).statusCode;
}

describe("edge bot shed", () => {
  it("serves LinkedInBot even though its UA contains 'Apache-HttpClient'", () => {
    // The Aug 2 2026 regression: `httpclient` in SHED_BOTS 429'd every LinkedIn
    // link preview, so shared movie/series pages unfurled blank.
    expect(
      statusOf("LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)"),
    ).toBeUndefined();
    expect(
      statusOf(
        "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)",
      ),
    ).toBeUndefined();
  });

  it("serves search engines and social unfurl bots", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    ]) {
      expect(statusOf(ua), ua).toBeUndefined();
    }
  });

  it("serves real browsers", () => {
    expect(
      statusOf(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      ),
    ).toBeUndefined();
  });

  it("still sheds the no-value scrapers with 429", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "python-requests/2.31.0",
      "Scrapy/2.11.0 (+https://scrapy.org)",
      "Apache-HttpClient/4.5.13 (Java/11.0.16)", // bare client, no allowlisted bot
      "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
      "Wget/1.21.3",
    ]) {
      expect(statusOf(ua), ua).toBe(429);
    }
  });

  it("does not shed when no user-agent is present", () => {
    expect((handler({ request: request() }) as CfResponse).statusCode).toBeUndefined();
  });
});

describe("cookie normalization", () => {
  it("strips cookies for anonymous viewers so they share one cache key", () => {
    const out = handler({ request: request("Mozilla/5.0", "ph_id=abc; _ga=1") }) as CfRequest;
    expect(out.headers.cookie).toBeUndefined();
  });

  it("keeps cookies intact for a logged-in viewer", () => {
    for (const name of ["__Secure-authjs.session-token", "authjs.session-token"]) {
      const cookie = `${name}=tok; other=1`;
      const out = handler({ request: request("Mozilla/5.0", cookie) }) as CfRequest;
      expect(out.headers.cookie?.value).toBe(cookie);
    }
  });

  it("sheds before touching cookies (a shed scraper never reaches the cache-key logic)", () => {
    const out = handler({ request: request("python-requests/2.31.0", "authjs.session-token=x") });
    expect((out as CfResponse).statusCode).toBe(429);
  });
});
