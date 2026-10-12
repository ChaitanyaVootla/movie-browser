import { describe, expect, it } from "vitest";
import type { MediaContextState } from "@/stores/media-context";
import { getContextualPrompts } from "./prompts";

const ctx = (over: Partial<MediaContextState>): MediaContextState => ({
  mediaType: "movie",
  itemId: 1,
  title: "Placeholder Film",
  year: null,
  runtime: null,
  rating: null,
  voteCount: null,
  genres: null,
  aiQuestions: null,
  postWatchQuestions: null,
  trivia: null,
  seasonCount: null,
  status: null,
  ...over,
});

describe("taste-aware Cue prompts (taste v2 §5.1)", () => {
  it("puts 'Would I like this?' first on a detail page for a viewer with a profile", () => {
    const prompts = getContextualPrompts("/movie/1/placeholder-film", ctx({}), { hasTasteProfile: true });
    expect(prompts[0]).toEqual({
      text: "Would I like this?",
      message: "Would I like Placeholder Film? Compare it to what I usually love.",
    });
    expect(prompts).toHaveLength(4);

    const series = getContextualPrompts("/series/2/x", ctx({ mediaType: "series", title: "Some Show" }), {
      hasTasteProfile: true,
    });
    expect(series[0].message).toBe("Would I like Some Show? Compare it to what I usually love.");
  });

  it("omits it without a profile (signed out / cold start)", () => {
    const prompts = getContextualPrompts("/movie/1/placeholder-film", ctx({}));
    expect(prompts.some((p) => p.text === "Would I like this?")).toBe(false);
    const noFlag = getContextualPrompts("/movie/1/placeholder-film", ctx({}), { hasTasteProfile: false });
    expect(noFlag.some((p) => p.text === "Would I like this?")).toBe(false);
  });

  it("home gets For-you prompts only with a profile", () => {
    const withProfile = getContextualPrompts("/", null, { hasTasteProfile: true });
    expect(withProfile.map((p) => p.message)).toEqual(
      expect.arrayContaining(["What's in my For-you row and why?", "Pick one thing from my picks for tonight"])
    );
    expect(withProfile).toHaveLength(4);
    const without = getContextualPrompts("/", null);
    expect(without.some((p) => p.message.includes("For-you"))).toBe(false);
  });
});
