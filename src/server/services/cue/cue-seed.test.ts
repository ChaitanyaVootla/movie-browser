import { describe, it, expect } from "vitest";
import {
  CUE_USERNAME,
  CUE_METADATA,
  shouldSkipTitle,
  type TitleSeedState,
} from "./cue-seed";

describe("Cue user identity", () => {
  it("uses the reserved 'cue' username and a bot metadata flag", () => {
    expect(CUE_USERNAME).toBe("cue");
    expect(CUE_METADATA.bot).toBe(true);
  });
});

describe("shouldSkipTitle (idempotency)", () => {
  const base: TitleSeedState = { hasCueSeed: false, hasHumanComment: false };

  it("does NOT skip a virgin title", () => {
    expect(shouldSkipTitle(base)).toBe(false);
  });

  it("skips a title that already has a Cue seed", () => {
    expect(shouldSkipTitle({ ...base, hasCueSeed: true })).toBe(true);
  });

  it("skips a title that already has any human comment (the long tail stays empty unless humans showed up)", () => {
    expect(shouldSkipTitle({ ...base, hasHumanComment: true })).toBe(true);
  });
});
