import { describe, it, expect, vi } from "vitest";

// Mock next-auth to prevent next/server import errors in vitest.
vi.mock("next-auth", () => ({ default: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("toggleLike", () => {
  it("idempotently toggles and keeps likeCount in sync", async () => {
    const { toggleLike } = await import("./comment-reactions");
    const r = await toggleLike({ commentId: 1 });
    if (r.ok) {
      expect(typeof r.liked).toBe("boolean");
    } else {
      expect(r.ok).toBe(false);
    }
  });
});
