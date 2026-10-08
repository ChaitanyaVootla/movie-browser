/**
 * SSE enrich stream — the stale-HTML self-heal contract: every stream opens
 * with PG's current ratings; `?once=1&ai=1` returns a one-shot snapshot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@/server/db/postgres", () => ({
  prisma: { movie: { findUnique: (...a: unknown[]) => findUnique(...a) }, series: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));
const getAIData = vi.fn();
vi.mock("@/server/services/ai-data-service", () => ({ getAIData: (...a: unknown[]) => getAIData(...a) }));
vi.mock("@/lib/logger", () => ({
  apiLogger: { child: () => ({ debug: vi.fn(), error: vi.fn() }) },
}));

import { GET } from "./route";

const pgRow = {
  ratingsScrapedAt: new Date("2026-10-08T10:00:00Z"),
  ratings: [
    {
      score: 8.7,
      voteCount: 2000000,
      certified: null,
      consensus: null,
      sentiment: null,
      sourceUrl: "https://www.imdb.com/title/tt0816692",
      source: { slug: "imdb", name: "IMDb", maxScore: 10 },
    },
  ],
};
const ai = { hook: "Love transcends.", mood: null, insights: { spoilerFree: {}, spoilerContent: {} }, generatedAt: null };

async function events(url: string): Promise<Array<{ type: string; data?: unknown }>> {
  const req = new NextRequest(url);
  const res = await GET(req, { params: Promise.resolve({ mediaType: "movie", id: "157336" }) });
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => JSON.parse(c.slice(6)));
}

beforeEach(() => {
  findUnique.mockReset();
  getAIData.mockReset();
});

describe("enrich SSE route", () => {
  it("fully-settled title: sends the PG ratings snapshot BEFORE done (stale HTML heals)", async () => {
    findUnique.mockResolvedValue(pgRow);
    getAIData.mockResolvedValue(ai);
    const ev = await events("http://localhost/api/movie/157336/enrich");
    expect(ev.map((e) => e.type)).toEqual(["ratings", "done"]);
    // AI is NOT pushed on the default stream (big payload; client asks if needed)
  });

  it("?once=1&ai=1: one-shot ratings + AI, no polling even when not settled", async () => {
    findUnique.mockResolvedValue({ ...pgRow, ratingsScrapedAt: null });
    getAIData.mockResolvedValue(ai);
    const ev = await events("http://localhost/api/movie/157336/enrich?once=1&ai=1");
    expect(ev.map((e) => e.type)).toEqual(["ratings", "ai", "done"]);
  });

  it("no ratings rows: no ratings event (client keeps HTML)", async () => {
    findUnique.mockResolvedValue({ ratingsScrapedAt: new Date(), ratings: [] });
    getAIData.mockResolvedValue(null);
    const ev = await events("http://localhost/api/movie/157336/enrich?once=1&ai=1");
    expect(ev.map((e) => e.type)).toEqual(["done"]);
  });
});
