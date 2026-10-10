/**
 * Growth FLIP for the open hover preview. BUG pinned: when details arrived the
 * panel jumped to its full height while the new rows were still at opacity 0,
 * an empty block under the actions (/browse, Oct 2026). The clip now opens
 * from the old box to the new one.
 */
import { describe, expect, it, vi } from "vitest";
import { GROW_DURATION_MS, growPanel, growthInsets } from "./preview-morph";

describe("growthInsets", () => {
  it("clips the new bottom back to the old one when the panel grows downward", () => {
    expect(growthInsets({ top: 100, bottom: 400 }, { top: 100, bottom: 560 })).toEqual({
      top: 0,
      bottom: 160,
    });
  });

  it("clips the new top when a flipped (bottom-anchored) panel grows upward", () => {
    expect(growthInsets({ top: 300, bottom: 700 }, { top: 180, bottom: 700 })).toEqual({
      top: 120,
      bottom: 0,
    });
  });

  it("returns null for a shrink or no change (nothing to reveal)", () => {
    expect(growthInsets({ top: 100, bottom: 500 }, { top: 100, bottom: 420 })).toBeNull();
    expect(growthInsets({ top: 100, bottom: 500 }, { top: 100, bottom: 500 })).toBeNull();
  });
});

describe("growPanel", () => {
  const fakePanel = () => {
    const animate = vi.fn();
    return { el: { animate } as unknown as HTMLElement, animate };
  };

  it("animates clip-path from the old box to the full panel", () => {
    const { el, animate } = fakePanel();
    growPanel(el, { top: 100, bottom: 400 }, { top: 100, bottom: 560 }, false);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, opts] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(frames[0].clipPath).toBe("inset(0px 0px 160px 0px round 12px)");
    expect(frames[1].clipPath).toBe("inset(0px 0px 0px 0px round 12px)");
    expect(opts.duration).toBe(GROW_DURATION_MS);
  });

  it("does nothing under reduced motion or on a shrink", () => {
    const { el, animate } = fakePanel();
    growPanel(el, { top: 100, bottom: 400 }, { top: 100, bottom: 560 }, true);
    growPanel(el, { top: 100, bottom: 560 }, { top: 100, bottom: 400 }, false);
    expect(animate).not.toHaveBeenCalled();
  });
});
