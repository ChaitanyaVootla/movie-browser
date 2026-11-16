import { NextURL } from "next/dist/server/web/next-url";
import { describe, expect, it } from "vitest";
import { internalRewriteUrl } from "./internal-rewrite";

// What Auth.js hands the proxy: nextUrl re-based onto AUTH_URL.
const authUrl = () => new NextURL("https://themoviebrowser.com/movie/155/the-dark-knight.md?x=1");

describe("internalRewriteUrl", () => {
  it("targets next start's own origin so Next serves the rewrite in-process", () => {
    const url = internalRewriteUrl(authUrl(), "https", "3002");
    // must equal resolve-routes' initURL origin: <proto>://localhost:<port>
    expect(url.origin).toBe("https://localhost:3002");
    expect(url.pathname).toBe("/movie/155/the-dark-knight.md");
    expect(url.search).toBe("?x=1");
  });

  it("uses http when the hop was not https (no or http X-Forwarded-Proto)", () => {
    expect(internalRewriteUrl(authUrl(), null, "3002").origin).toBe("http://localhost:3002");
    expect(internalRewriteUrl(authUrl(), "http", "3002").origin).toBe("http://localhost:3002");
  });

  it("leaves the URL alone without PORT (dev servers started with -p)", () => {
    expect(internalRewriteUrl(authUrl(), "https", undefined).origin).toBe(
      "https://themoviebrowser.com",
    );
  });

  it("does not mutate the request's nextUrl", () => {
    const original = authUrl();
    internalRewriteUrl(original, "https", "3002");
    expect(original.origin).toBe("https://themoviebrowser.com");
  });
});
