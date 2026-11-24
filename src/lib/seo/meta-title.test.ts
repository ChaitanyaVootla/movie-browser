import { describe, it, expect } from "vitest";
import { watchTitle, META_TITLE_MAX } from "./meta-title";

describe("watchTitle", () => {
  it("keeps the full variant for short names", () => {
    expect(watchTitle("Up (2009)", "Movie Browser")).toBe(
      "Up (2009) — Where to Watch, Ratings & Cast | Movie Browser"
    );
  });

  it("drops suffix parts to stay within the budget", () => {
    const t = watchTitle("Interstellar (2014)", "Movie Browser");
    expect(t).toBe("Interstellar (2014) — Where to Watch | Movie Browser");
    expect(t.length).toBeLessThanOrEqual(META_TITLE_MAX);
  });

  it("keeps the watch intent before the brand for mid-length names", () => {
    const t = watchTitle("Everything Everywhere All at Once (2022)", "Movie Browser");
    expect(t).toBe("Everything Everywhere All at Once (2022): Where to Watch");
  });

  it("returns the bare name when nothing fits", () => {
    const base = "A".repeat(70);
    expect(watchTitle(base, "Movie Browser")).toBe(base);
  });

  it("never exceeds the budget unless the name alone does", () => {
    for (let n = 1; n <= 60; n++) {
      const t = watchTitle(`${"x".repeat(n)} (2020)`, "Movie Browser");
      if (n + 7 <= META_TITLE_MAX) expect(t.length).toBeLessThanOrEqual(META_TITLE_MAX);
    }
  });
});
