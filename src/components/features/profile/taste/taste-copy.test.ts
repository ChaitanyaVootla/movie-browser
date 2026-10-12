import { describe, expect, it } from "vitest";
import {
  axisEndDescription,
  axisEndTitle,
  clusterDescription,
  differenceCaption,
  moodEvidenceLine,
  shareText,
  shareTitle,
} from "./taste-copy";
import { matchSegments } from "./match-segments";

const FABLE = /you're|you are|\bare a\b/i;
const axis = (value: number, lowLabel = "Mainstream", highLabel = "Niche") => ({ value, lowLabel, highLabel });

describe("taste copy templates", () => {
  it("difference caption: points toward the end the viewer sits nearer, or Same spot", () => {
    expect(differenceCaption(axis(0.2), 0.65)).toBe("You sit 45 points closer to Niche");
    expect(differenceCaption(axis(0.7), 0.3)).toBe("You sit 40 points closer to Mainstream");
    expect(differenceCaption(axis(0.5), 0.51)).toBe("Same spot");
  });

  it("share text: the three axes farthest from centre as end labels + the count", () => {
    const axes = [axis(0.9), axis(0.1, "Classic", "New"), axis(0.8, "Focused", "Eclectic"), axis(0.55, "Light", "Heavy")];
    expect(shareText(axes, 42)).toBe("Niche · Classic · Eclectic — 42 titles");
    expect(shareText([axis(0.5)], 1)).toBe("1 title");
    expect(shareTitle("Ada")).toBe("Ada's taste on The Movie Browser");
  });

  it("every template stays numbers + titles + dimension words (Fable rule)", () => {
    const full = {
      key: "mainstream" as const,
      value: 0.2,
      support: 5,
      lowLabel: "Mainstream",
      highLabel: "Niche",
      caption: "",
      examples: { low: [], high: [] },
    };
    const strings = [
      differenceCaption(axis(0.2), 0.9),
      differenceCaption(axis(0.2), 0.2),
      shareText([axis(0.9), axis(0.1)], 12),
      shareTitle("Ada"),
      moodEvidenceLine({ count: 3, lift: 2 }),
      moodEvidenceLine({ count: 1, lift: 1 }),
      clusterDescription({ size: 10, importance: 0.38, medoid: { mediaType: "movie", tmdbId: 1, title: "Interstellar", posterPath: null } }),
      axisEndTitle(full, "high"),
      axisEndDescription(full, "low"),
      ...matchSegments({ scoreSim: 0.56, likedSim: 0.68, tasteSim: 0.28 }).map((s) => s.label),
    ];
    for (const s of strings) expect(s).not.toMatch(FABLE);
  });
});

describe("matchSegments", () => {
  it("segments sum to the headline score (weighted contributions, not three scores)", () => {
    const segs = matchSegments({ scoreSim: 0.56, likedSim: 0.68, tasteSim: 0.28 });
    const total = segs.reduce((a, s) => a + s.width, 0);
    // computeTasteMatch: (0.56*0.5 + 0.68*0.3 + 0.28*0.2) / 1.0 = 0.54
    expect(Math.round(total)).toBe(54);
    expect(segs.map((s) => s.key)).toEqual(["scoreSim", "likedSim", "tasteSim"]);
  });

  it("renormalises over the components present", () => {
    const segs = matchSegments({ scoreSim: 0.7, likedSim: 0.8, tasteSim: null });
    expect(segs).toHaveLength(2);
    // (0.7*0.5 + 0.8*0.3) / 0.8 = 0.7375
    expect(Math.round(segs.reduce((a, s) => a + s.width, 0))).toBe(74);
  });
});
