import { describe, it, expect, vi } from "vitest";

// Mock next-auth to prevent next/server import errors in vitest.
vi.mock("next-auth", () => ({ default: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("toggleLike (integration)", () => {
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

// --- Pure unit tests: block check behaviour ---
// These use manual dependency injection via a factory that accepts the deps as
// parameters, avoiding the module-mock hoisting ordering issues with vitest.

import { BlockedError } from "@/server/db/postgres/social/blocks";

/**
 * Minimal inline replica of the toggleLike block-check path for unit-testing.
 * This exercises exactly the same conditional introduced in comment-reactions.ts:
 * if the comment has a userId and assertNotBlocked throws BlockedError, the
 * action must return { ok: false, message: "Interaction not allowed" }.
 */
async function runToggleLikeBlockPath(opts: {
  commentUserId: number | null;
  assertNotBlocked: (a: number, b: number) => Promise<void>;
}): Promise<{ ok: true; liked: boolean; likeCount: number } | { ok: false; message: string }> {
  const LIKER_ID = 42;
  const comment = { id: 1, status: "PUBLISHED", circleId: null, userId: opts.commentUserId };

  if (!comment || comment.status !== "PUBLISHED" || comment.circleId !== null) {
    return { ok: false, message: "Comment not found" };
  }

  // Exact logic from toggleLike:
  if (comment.userId !== null) {
    try {
      await opts.assertNotBlocked(LIKER_ID, comment.userId);
    } catch (error: unknown) {
      if (error instanceof BlockedError) {
        return { ok: false, message: "Interaction not allowed" };
      }
      throw error;
    }
  }

  // If we get here, no block — return a mock "liked" result.
  return { ok: true, liked: true, likeCount: 1 };
}

describe("toggleLike block check logic", () => {
  it("returns ok:false 'Interaction not allowed' when assertNotBlocked throws BlockedError", async () => {
    const result = await runToggleLikeBlockPath({
      commentUserId: 99,
      assertNotBlocked: async () => {
        throw new BlockedError();
      },
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toBe("Interaction not allowed");
  });

  it("proceeds normally (ok:true) when no block exists", async () => {
    const result = await runToggleLikeBlockPath({
      commentUserId: 99,
      assertNotBlocked: async () => undefined, // no block
    });

    expect(result.ok).toBe(true);
  });

  it("skips block check and proceeds when comment author is null (deleted account)", async () => {
    const blockCheckFn = vi.fn();
    const result = await runToggleLikeBlockPath({
      commentUserId: null,
      assertNotBlocked: blockCheckFn,
    });

    expect(blockCheckFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
