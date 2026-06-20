import { describe, expect, it } from "vitest";
import { resolveAvatarUrl, resolveAvatarCrop } from "./resolve-avatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/abc";
const TMDB = "https://image.tmdb.org/t/p";

describe("resolveAvatarUrl", () => {
  it("prefers a chosen TMDB avatar over the Google photo", () => {
    expect(resolveAvatarUrl(GOOGLE, { profile: { avatarImagePath: "/poster.jpg" } })).toBe(
      `${TMDB}/w342/poster.jpg`
    );
  });

  it("falls back to the Google photo when no avatar is chosen", () => {
    expect(resolveAvatarUrl(GOOGLE, { profile: { accent: "rose" } })).toBe(GOOGLE);
    expect(resolveAvatarUrl(GOOGLE, {})).toBe(GOOGLE);
    expect(resolveAvatarUrl(GOOGLE, null)).toBe(GOOGLE);
  });

  it("returns null when neither is available", () => {
    expect(resolveAvatarUrl(null, null)).toBeNull();
    expect(resolveAvatarUrl(null, { profile: {} })).toBeNull();
  });

  it("ignores a non-string avatarImagePath", () => {
    expect(resolveAvatarUrl(GOOGLE, { profile: { avatarImagePath: 42 } })).toBe(GOOGLE);
  });
});

describe("resolveAvatarCrop", () => {
  it("returns the normalized crop when an avatar is chosen", () => {
    const crop = { zoom: 1.5, nx: -0.2, ny: 0, r: 1.78 };
    expect(
      resolveAvatarCrop({ profile: { avatarImagePath: "/p.jpg", avatarCrop: crop } })
    ).toEqual(crop);
  });

  it("returns null when there is no chosen avatar (crop is meaningless for Google photos)", () => {
    expect(resolveAvatarCrop({ profile: { avatarCrop: { zoom: 2, nx: 0, ny: 0, r: 1 } } })).toBeNull();
    expect(resolveAvatarCrop(null)).toBeNull();
  });

  it("returns null for a malformed stored crop", () => {
    expect(resolveAvatarCrop({ profile: { avatarImagePath: "/p.jpg", avatarCrop: { zoom: 0.2 } } })).toBeNull();
    expect(resolveAvatarCrop({ profile: { avatarImagePath: "/p.jpg" } })).toBeNull();
  });
});
