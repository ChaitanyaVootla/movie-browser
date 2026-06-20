import { describe, expect, it } from "vitest";
import { avatarInitials } from "./avatar-initials";

describe("avatarInitials", () => {
  it("uses the first letter of the first two words", () => {
    expect(avatarInitials("John Doe")).toBe("JD");
    expect(avatarInitials("ada lovelace stuff")).toBe("AL");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(avatarInitials("cinephile")).toBe("CI");
    expect(avatarInitials("x")).toBe("X");
  });

  it("collapses extra whitespace", () => {
    expect(avatarInitials("  binge   bea ")).toBe("BB");
  });

  it("returns a placeholder for empty input", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("   ")).toBe("?");
  });
});
