/**
 * Regression lock (Nov 2026): setPosition on a series with no episode rows in
 * PG used to run its "pull the watermark back" delete anyway, report success,
 * and leave nothing saved. With no catalog episodes up to the position it must
 * write NOTHING and report matched=0 so the action can surface an error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const episodeFindMany = vi.fn();
const transaction = vi.fn();
vi.mock("@/server/db/postgres", () => ({
  prisma: {
    episode: { findMany: (...a: unknown[]) => episodeFindMany(...a) },
    series: { findUnique: vi.fn().mockResolvedValue({ firstAirDate: null, episodeRunTime: [] }) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));
vi.mock("./progress", () => ({ recomputeSeriesProgress: vi.fn() }));
vi.mock("./stats-dirty", () => ({ markStatsDirty: vi.fn() }));

import { setPosition } from "./watch-events";

beforeEach(() => vi.clearAllMocks());

describe("setPosition with no catalog episodes", () => {
  it("writes nothing and reports matched=0", async () => {
    episodeFindMany.mockResolvedValue([]);
    await expect(setPosition(1, 84773, 1, 3)).resolves.toEqual({
      inserted: 0,
      removed: 0,
      matched: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
