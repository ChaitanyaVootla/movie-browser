import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the where passed to prisma.comment.count.
const countMock = vi.fn().mockResolvedValue(0);
vi.mock("@/server/db/postgres", () => ({
  prisma: { comment: { count: (args: unknown) => countMock(args) } },
  // Prisma namespace is only used as a type in comments.ts (erased at runtime).
  Prisma: {},
}));

// Block filter: exclude author id 99 for the viewer.
vi.mock("./blocks", () => ({
  getExcludedAuthorIds: vi.fn().mockResolvedValue([99]),
}));

import { countVisibleNewSince } from "./comments";
import { ANON_GATE_CONTEXT, type ViewerGateContext } from "@/server/services/discussion/spoiler-gate";

const VIEWER: ViewerGateContext = { ...ANON_GATE_CONTEXT, loggedIn: true, movieWatched: true };
const anchor = { type: "movie", movieId: 603 } as const;

interface WhereArg {
  where: { AND: Array<Record<string, unknown>> };
}
const lastCall = (): WhereArg => countMock.mock.calls[countMock.mock.calls.length - 1][0] as WhereArg;

describe("countVisibleNewSince", () => {
  beforeEach(() => countMock.mockClear());

  it("counts only visible roots (gated visibility + block filter + parentId:null)", async () => {
    await countVisibleNewSince(anchor, VIEWER, 7, new Date("2026-06-10T00:00:00Z"));
    const { where } = lastCall();
    const json = JSON.stringify(where);
    // Roots only.
    expect(where.AND.some((c) => c.parentId === null)).toBe(true);
    // Anchor scoping.
    expect(json).toContain('"movieId":603');
    // Block filter excludes the blocked author.
    expect(json).toContain("99");
    // Visibility predicate present (own held/published OR public gated set).
    expect(json).toContain("PUBLISHED");
  });

  it("adds a createdAt > since clause when since is provided", async () => {
    const since = new Date("2026-06-10T00:00:00Z");
    await countVisibleNewSince(anchor, VIEWER, 7, since);
    const { where } = lastCall();
    const createdClause = where.AND.find(
      (c) => typeof c.createdAt === "object" && c.createdAt !== null && "gt" in (c.createdAt as object)
    ) as { createdAt: { gt: Date } } | undefined;
    expect(createdClause).toBeDefined();
    expect((createdClause as { createdAt: { gt: Date } }).createdAt.gt).toEqual(since);
  });

  it("omits the createdAt clause on first visit (since = null) → counts all visible roots", async () => {
    await countVisibleNewSince(anchor, VIEWER, 7, null);
    const { where } = lastCall();
    const hasCreatedAt = where.AND.some(
      (c) => typeof c.createdAt === "object" && c.createdAt !== null && "gt" in (c.createdAt as object)
    );
    expect(hasCreatedAt).toBe(false);
  });
});
