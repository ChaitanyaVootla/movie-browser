/**
 * Merge-only semantics for scraper-sourced rows (Oct 2026 overhaul).
 *
 * Pins two bugs:
 * - upsertExternalIds fully reconciled, so a refresh where the scraper failed
 *   or was skipped DELETED every stored RT/Letterboxd/Metacritic slug;
 * - watch links were India-only and never removed, so a title that left a
 *   service kept its dead deep link forever.
 */
import { describe, it, expect, vi } from "vitest";
import { upsertExternalIds } from "./shared-upserts";
import { upsertScrapedWatchLinks } from "./rating-upserts";
import type { PrismaTx } from "./types";

function fakeTx(existing: { externalIds?: unknown[]; links?: unknown[] }) {
  const tx = {
    externalId: {
      findMany: vi.fn(async (_args: unknown) => existing.externalIds ?? []),
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
      update: vi.fn(async (_args: unknown) => ({})),
      createMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
    scrapedWatchLink: {
      findMany: vi.fn(async (_args: unknown) => existing.links ?? []),
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
      upsert: vi.fn(async (_args: unknown) => ({})),
    },
  };
  return { tx, asTx: tx as unknown as PrismaTx };
}

describe("upsertExternalIds", () => {
  it("never deletes scraper-resolved ids when the scrape returned none", async () => {
    const { tx, asTx } = fakeTx({
      externalIds: [
        { id: 1, source: "imdb", externalId: "tt1" },
        { id: 2, source: "rottentomatoes", externalId: "m/x" },
        { id: 3, source: "letterboxd", externalId: "x" },
        { id: 4, source: "wikidata", externalId: "Q1" },
      ],
    });
    await upsertExternalIds(asTx, 10, "movie", { external_ids: { imdb_id: "tt1" } }, {});
    expect(tx.externalId.deleteMany).not.toHaveBeenCalled();
  });

  it("still reconciles TMDB-owned ids (TMDB dropped a facebook id)", async () => {
    const { tx, asTx } = fakeTx({
      externalIds: [
        { id: 1, source: "imdb", externalId: "tt1" },
        { id: 5, source: "tvdb", externalId: "123" },
      ],
    });
    await upsertExternalIds(asTx, 10, "movie", { external_ids: { imdb_id: "tt1" } }, {});
    expect(tx.externalId.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [5] } } });
  });

  it("updates a scraper id that changed", async () => {
    const { tx, asTx } = fakeTx({ externalIds: [{ id: 2, source: "rottentomatoes", externalId: "m/old" }] });
    await upsertExternalIds(asTx, 10, "movie", {}, { rottentomatoes: "m/new" });
    expect(tx.externalId.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { externalId: "m/new" } });
  });
});

describe("upsertScrapedWatchLinks", () => {
  const existingLinks = [
    { id: 1, providerName: "Netflix", link: "https://netflix/1", price: "Subscription", countryCode: "IN" },
    { id: 2, providerName: "Hulu", link: "https://hulu/1", price: "Subscription", countryCode: "US" },
    { id: 3, providerName: "JioHotstar", link: "https://hotstar/1", price: "Subscription", countryCode: "IN" },
  ];

  it("authoritative country: stale links removed, unchanged ones not rewritten", async () => {
    const { tx, asTx } = fakeTx({ links: existingLinks });
    await upsertScrapedWatchLinks(
      asTx,
      10,
      "movie",
      [{ provider: "Netflix", link: "https://netflix/1", price: "Subscription", country: "IN" }],
      ["IN"]
    );
    expect(tx.scrapedWatchLink.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [3] } } });
    expect(tx.scrapedWatchLink.upsert).not.toHaveBeenCalled();
  });

  it("non-authoritative countries are never touched (failed scrape keeps US)", async () => {
    const { tx, asTx } = fakeTx({ links: existingLinks });
    await upsertScrapedWatchLinks(asTx, 10, "movie", [], ["IN"]);
    const deleted = tx.scrapedWatchLink.deleteMany.mock.calls[0]?.[0] as { where: { id: { in: number[] } } };
    expect(deleted.where.id.in).toEqual([1, 3]);
  });

  it("empty payload with no authoritative countries is a no-op", async () => {
    const { tx, asTx } = fakeTx({ links: existingLinks });
    await upsertScrapedWatchLinks(asTx, 10, "movie", []);
    expect(tx.scrapedWatchLink.findMany).not.toHaveBeenCalled();
  });

  it("writes new per-country links; country defaults to IN for legacy links", async () => {
    const { tx, asTx } = fakeTx({ links: [] });
    await upsertScrapedWatchLinks(asTx, 10, "series", [
      { provider: "Hulu", link: "https://hulu/2", price: "Subscription", country: "US" },
      { provider: "Netflix", link: "https://netflix/2", price: "Subscription" },
    ]);
    const where = tx.scrapedWatchLink.upsert.mock.calls.map(
      (c) => (c[0] as { where: { seriesId_providerName_countryCode: { countryCode: string } } }).where
    );
    expect(where.map((w) => w.seriesId_providerName_countryCode.countryCode)).toEqual(["US", "IN"]);
  });
});
