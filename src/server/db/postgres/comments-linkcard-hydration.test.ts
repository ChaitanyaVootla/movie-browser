import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinkUnfurlDto } from "./social/link-unfurls";
import { urlHash } from "@/server/services/discussion/url-normalize";

/**
 * End-to-end wiring test for I1: link cards must hydrate through the SHARED
 * `pageWithReplies` builder (used by BOTH getPublicCommentPage render/ISR and
 * getVisibleCommentPage gated paths), from CACHED link_unfurls rows via ONE
 * batched query + a pure in-process join — no network on the render path.
 */

const OK_URL = "https://example.com/ok";
const FAILED_URL = "https://example.com/failed";
const MISSING_URL = "https://example.com/missing";

// Seeded unfurl cache: only the OK url has an OK row; FAILED url has a FAILED row.
const seeded = new Map<string, LinkUnfurlDto>([
  [
    urlHash(OK_URL),
    {
      urlHash: urlHash(OK_URL),
      url: OK_URL,
      domain: "example.com",
      status: "OK",
      title: "Seeded OK",
      description: "desc",
      imageUrl: null,
      faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
      provider: "GENERIC",
      youtubeId: null,
    },
  ],
  [
    urlHash(FAILED_URL),
    {
      urlHash: urlHash(FAILED_URL),
      url: FAILED_URL,
      domain: "example.com",
      status: "FAILED",
      title: null,
      description: null,
      imageUrl: null,
      faviconUrl: null,
      provider: "GENERIC",
      youtubeId: null,
    },
  ],
]);

vi.mock("./social/link-unfurls", () => ({
  getUnfurlsByHashes: vi.fn(async (hashes: string[]) => {
    const out = new Map<string, LinkUnfurlDto>();
    for (const h of hashes) {
      const row = seeded.get(h);
      if (row) out.set(h, row);
    }
    return out;
  }),
}));

function commentRow(id: number, body: string) {
  return {
    id,
    parentId: null,
    body,
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PUBLISHED",
    likeCount: 0,
    createdAt: new Date("2026-06-15T00:00:00Z"),
    editedAt: null,
    user: null,
    attachmentEntityType: null,
    attachmentImagePath: null,
    attachmentMovieId: null,
    attachmentSeriesId: null,
    attachmentPersonId: null,
    entityMentions: [],
  };
}

const findManyMock = vi.fn();
const groupByMock = vi.fn().mockResolvedValue([]);

vi.mock("@/server/db/postgres", () => ({
  prisma: {
    comment: {
      findMany: (args: unknown) => findManyMock(args),
      groupBy: () => groupByMock(),
    },
  },
  Prisma: {},
}));

import { getPublicCommentPage } from "./comments";

const anchor = { type: "movie", movieId: 603 } as const;

describe("link-card hydration through pageWithReplies", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    groupByMock.mockClear();
  });

  it("hydrates linkCard from a cached OK unfurl, leaves FAILED/missing null", async () => {
    findManyMock
      .mockResolvedValueOnce([
        commentRow(1, `great read ${OK_URL}`),
        commentRow(2, `meh ${FAILED_URL}`),
        commentRow(3, `dunno ${MISSING_URL}`),
        commentRow(4, "no link at all"),
      ]) // roots
      .mockResolvedValueOnce([]); // replies

    const page = await getPublicCommentPage(anchor);

    const byId = new Map(page.roots.map((r) => [r.id, r]));
    expect(byId.get(1)?.linkCard?.title).toBe("Seeded OK"); // OK row → non-null
    expect(byId.get(2)?.linkCard).toBeNull(); // FAILED row → null
    expect(byId.get(3)?.linkCard).toBeNull(); // missing row → null
    expect(byId.get(4)?.linkCard).toBeNull(); // no link → null
  });
});
