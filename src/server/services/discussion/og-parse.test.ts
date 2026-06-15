import { describe, it, expect } from "vitest";
import { parseOgMeta } from "./og-parse";

describe("parseOgMeta", () => {
  it("reads og:title / og:description / og:image", () => {
    const html = `<html><head>
      <meta property="og:title" content="Hello World" />
      <meta property="og:description" content="A great page" />
      <meta property="og:image" content="https://cdn.example.com/x.jpg" />
    </head><body></body></html>`;
    expect(parseOgMeta(html)).toEqual({
      title: "Hello World",
      description: "A great page",
      imageUrl: "https://cdn.example.com/x.jpg",
    });
  });
  it("falls back to <title> and meta[name=description]", () => {
    const html = `<html><head>
      <title>Fallback Title</title>
      <meta name="description" content="meta desc" />
    </head></html>`;
    expect(parseOgMeta(html)).toEqual({
      title: "Fallback Title",
      description: "meta desc",
      imageUrl: null,
    });
  });
  it("prefers twitter:image when og:image absent", () => {
    const html = `<head><meta name="twitter:image" content="https://t.example/y.png" /></head>`;
    expect(parseOgMeta(html).imageUrl).toBe("https://t.example/y.png");
  });
  it("returns all-null on empty/garbage", () => {
    expect(parseOgMeta("")).toEqual({ title: null, description: null, imageUrl: null });
    expect(parseOgMeta("<html></html>")).toEqual({ title: null, description: null, imageUrl: null });
  });
  it("trims whitespace and caps overly long fields", () => {
    const long = "x".repeat(5000);
    const html = `<head><meta property="og:title" content="  ${long}  " /></head>`;
    const meta = parseOgMeta(html);
    expect(meta.title?.length).toBe(2000);
  });
});
