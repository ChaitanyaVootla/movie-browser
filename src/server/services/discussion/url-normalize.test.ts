import { describe, it, expect } from "vitest";
import { normalizeUrl, urlHash, extractFirstLink, parseYouTubeId } from "./url-normalize";

describe("normalizeUrl", () => {
  it("lowercases host, drops default port + fragment, keeps path/query", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/Path?b=2&a=1#frag")).toBe(
      "https://example.com/Path?b=2&a=1"
    );
  });
  it("returns null for non-http(s) schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com/x")).toBeNull();
    expect(normalizeUrl("data:text/html,hi")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("urlHash", () => {
  it("is a stable 64-char sha256 hex of the input string", () => {
    const h = urlHash("https://example.com/x");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(urlHash("https://example.com/x")).toBe(h);
    expect(urlHash("https://example.com/y")).not.toBe(h);
  });
});

describe("extractFirstLink", () => {
  it("returns the first normalized http(s) URL in a body", () => {
    expect(extractFirstLink("look at https://a.com/p and http://b.com")).toBe("https://a.com/p");
  });
  it("returns null when there is no link", () => {
    expect(extractFirstLink("no links here")).toBeNull();
  });
  it("ignores non-http schemes", () => {
    expect(extractFirstLink("ping me at mailto:x@y.com")).toBeNull();
  });
});

describe("parseYouTubeId", () => {
  it("extracts the 11-char id from watch + short + embed URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(parseYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
