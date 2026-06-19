import { describe, it, expect } from "vitest";
import { CUE_SYSTEM_PROMPT, buildCueUserPrompt } from "./cue-prompt";

describe("buildCueUserPrompt", () => {
  it("includes the title, year, genres and themes when present", () => {
    const p = buildCueUserPrompt({
      title: "The Matrix",
      year: 1999,
      mediaType: "movie",
      genres: ["Sci-Fi", "Action"],
      themes: ["free will", "simulated reality"],
      hook: "A hacker learns reality is a lie.",
      overview: "A computer hacker learns about the true nature of reality.",
    });
    expect(p).toContain("The Matrix");
    expect(p).toContain("1999");
    expect(p).toContain("simulated reality");
  });

  it("instructs spoiler-free, opinion-inviting, no-spoilers output in the system prompt", () => {
    expect(CUE_SYSTEM_PROMPT.toLowerCase()).toContain("no spoiler");
    expect(CUE_SYSTEM_PROMPT.toLowerCase()).toContain("question");
  });

  it("omits a missing-overview line gracefully", () => {
    const p = buildCueUserPrompt({
      title: "Untitled",
      year: null,
      mediaType: "series",
      genres: [],
      themes: [],
      hook: null,
      overview: null,
    });
    expect(p).toContain("Untitled");
    expect(p).not.toContain("undefined");
  });
});
