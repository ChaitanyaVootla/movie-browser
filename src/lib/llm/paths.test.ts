/**
 * Path parsing + `.md` detection + round-trip tests for the LLM markdown layer.
 */
import { describe, it, expect } from "vitest";
import {
  parseLlmPath,
  isMarkdownRequest,
  markdownPathToTarget,
  type LlmTarget,
} from "./paths";

describe("parseLlmPath", () => {
  it("parses home", () => {
    expect(parseLlmPath("/")).toEqual<LlmTarget>({ kind: "home" });
    expect(parseLlmPath("")).toEqual<LlmTarget>({ kind: "home" });
  });

  it("parses media detail paths with and without slug", () => {
    expect(parseLlmPath("/movie/27205/inception")).toEqual<LlmTarget>({
      kind: "movie",
      id: 27205,
    });
    expect(parseLlmPath("/movie/27205")).toEqual<LlmTarget>({ kind: "movie", id: 27205 });
    expect(parseLlmPath("/series/1396/breaking-bad")).toEqual<LlmTarget>({
      kind: "series",
      id: 1396,
    });
    expect(parseLlmPath("/person/6193/leonardo-dicaprio")).toEqual<LlmTarget>({
      kind: "person",
      id: 6193,
    });
  });

  it("rejects non-numeric or invalid ids", () => {
    expect(parseLlmPath("/movie/abc")).toBeNull();
    expect(parseLlmPath("/movie")).toBeNull();
    expect(parseLlmPath("/movie/-1")).toBeNull();
    expect(parseLlmPath("/movie/0")).toBeNull();
  });

  it("parses browse, search, topic and topics index", () => {
    expect(parseLlmPath("/browse")).toEqual<LlmTarget>({ kind: "browse" });
    expect(parseLlmPath("/search")).toEqual<LlmTarget>({ kind: "search" });
    expect(parseLlmPath("/topics")).toEqual<LlmTarget>({ kind: "static", slug: "topics" });
    expect(parseLlmPath("/topics/genre-action-movie")).toEqual<LlmTarget>({
      kind: "topic",
      topicKey: "genre-action-movie",
    });
  });

  it("parses static pages and rejects unknown slugs", () => {
    expect(parseLlmPath("/privacy")).toEqual<LlmTarget>({ kind: "static", slug: "privacy" });
    expect(parseLlmPath("/terms")).toEqual<LlmTarget>({ kind: "static", slug: "terms" });
    expect(parseLlmPath("/content-policy")).toEqual<LlmTarget>({
      kind: "static",
      slug: "content-policy",
    });
    expect(parseLlmPath("/about")).toEqual<LlmTarget>({ kind: "static", slug: "about" });
    expect(parseLlmPath("/nonsense")).toBeNull();
    expect(parseLlmPath("/browse/extra")).toBeNull();
  });
});

describe("isMarkdownRequest", () => {
  it("detects .md paths and the bare /search.md endpoint", () => {
    expect(isMarkdownRequest("/movie/27205/inception.md")).toBe(true);
    expect(isMarkdownRequest("/search.md")).toBe(true);
    expect(isMarkdownRequest("/browse.md")).toBe(true);
    expect(isMarkdownRequest("/movie/27205/inception")).toBe(false);
    expect(isMarkdownRequest("/llms.txt")).toBe(false);
  });
});

describe("markdownPathToTarget", () => {
  it("strips .md and maps special paths", () => {
    expect(markdownPathToTarget("/movie/27205/inception.md")).toBe("/movie/27205/inception");
    expect(markdownPathToTarget("/search.md")).toBe("/search");
    expect(markdownPathToTarget("/index.md")).toBe("/");
    expect(markdownPathToTarget("/.md")).toBe("/");
    expect(markdownPathToTarget("/topics.md")).toBe("/topics");
  });

  it("round-trips: a .md request maps to a parseable target", () => {
    const paths = [
      "/movie/27205/inception.md",
      "/series/1396/breaking-bad.md",
      "/person/6193/leo.md",
      "/browse.md",
      "/topics.md",
      "/topics/genre-action-movie.md",
      "/search.md",
      "/privacy.md",
      "/index.md",
    ];
    for (const p of paths) {
      expect(isMarkdownRequest(p)).toBe(true);
      const internal = markdownPathToTarget(p);
      expect(parseLlmPath(internal)).not.toBeNull();
    }
  });
});
