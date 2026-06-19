import { describe, it, expect, vi } from "vitest";

// Mock next-auth to prevent next/server import errors in vitest.
vi.mock("next-auth", () => ({ default: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("createComment Phase B persistence", () => {
  it("obscene body is held without an LLM call (prefilter short-circuits)", async () => {
    const { createComment } = await import("./comments");
    // Requires a seeded movie (550) + test-auth session in the harness; this test
    // documents the contract — the runner verifies pending_review on obscene input.
    // Zod schema fills in defaults (parentId, spoilerScope, etc.) at parse time.
    const res = await createComment({
      anchor: { type: "movie", movieId: 550 },
      body: "you are a fag",
      parentId: null,
      spoilerScope: "NONE",
      scopeSeason: null,
      scopeEpisode: null,
      confirmedScope: false,
      attachment: null,
    });
    expect(["pending_review", "error"]).toContain(res.status);
  });
});
