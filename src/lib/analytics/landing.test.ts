import { describe, it, expect } from "vitest";
import { classifyReferrer, referrerHost } from "./landing";

const SITE = "themoviebrowser.com";

describe("classifyReferrer", () => {
  it.each([
    ["www.google.com", "google"],
    ["www.google.co.in", "google"],
    ["www.bing.com", "bing"],
    ["cn.bing.com", "bing"],
    ["duckduckgo.com", "duckduckgo"],
    ["search.yahoo.com", "yahoo"],
    ["search.brave.com", "brave"],
    ["www.ecosia.org", "ecosia"],
    ["chatgpt.com", "ai"],
    ["gemini.google.com", "ai"],
    ["www.perplexity.ai", "ai"],
    ["old.reddit.com", "social"],
    ["t.co", "social"],
    ["themoviebrowser.com", "internal"],
    ["www.themoviebrowser.com", "internal"],
    ["example.org", "other"],
    ["notgoogle.com", "other"],
  ])("%s → %s", (host, kind) => {
    expect(classifyReferrer(host, SITE)).toBe(kind);
  });

  it("treats a missing referrer as direct", () => {
    expect(classifyReferrer(null, SITE)).toBe("direct");
  });
});

describe("referrerHost", () => {
  it("extracts the host and nothing else", () => {
    expect(referrerHost("https://www.google.com/search?q=secret")).toBe("www.google.com");
    expect(referrerHost("")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
  });
});
