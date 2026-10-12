import { describe, expect, it } from "vitest";
import { extractTuneTag, stripTuneTag, tuneHref } from "./tune-tag";

describe("[TUNE:…] chat tag", () => {
  it("extracts and normalizes the tokens", () => {
    const res = extractTuneTag("Darker series, coming up. [TUNE:series, darker,under100]");
    expect(res).toEqual({ tokens: ["series", "under100", "darker"], raw: "[TUNE:series, darker,under100]" });
  });

  it("drops unknown and malformed tokens", () => {
    expect(extractTuneTag("[TUNE:series,spooky,g:DROP TABLE,x:1,g:878,m:identity]")?.tokens).toEqual([
      "series",
      "g:878",
      "m:identity",
    ]);
  });

  it("caps at 8 tokens", () => {
    const many = Array.from({ length: 12 }, (_, i) => `g:${i + 1}`).join(",");
    expect(extractTuneTag(`[TUNE:${many}]`)?.tokens).toHaveLength(8);
  });

  it("returns null when absent or when nothing valid survives", () => {
    expect(extractTuneTag("No tag here")).toBeNull();
    expect(extractTuneTag("[TUNE:spooky,weird]")).toBeNull();
    expect(extractTuneTag("[TUNE:]")).toBeNull();
  });

  it("uses only the first tag", () => {
    expect(extractTuneTag("[TUNE:series] and [TUNE:movies]")?.tokens).toEqual(["series"]);
  });

  it("strips complete and still-streaming tags from the text", () => {
    expect(stripTuneTag("Here you go. [TUNE:series,darker]")).toBe("Here you go. ");
    expect(stripTuneTag("Here you go. [TUNE:ser")).toBe("Here you go. ");
    expect(stripTuneTag("Here you go. [TUN")).toBe("Here you go. ");
    expect(stripTuneTag("[MOVIE:1:X] stays")).toBe("[MOVIE:1:X] stays");
  });

  it("builds the home URL that carries the tune", () => {
    expect(tuneHref(["series", "g:878"])).toBe("/?tune=series%2Cg%3A878");
  });
});
