import { describe, it, expect } from "vitest";
import { shouldRunNow, takeTrendingBudget } from "./seed-cue-comments";

describe("shouldRunNow (cron-window guard)", () => {
  it("runs inside the configured UTC hour", () => {
    expect(shouldRunNow({ nowHourUtc: 23, cronHourUtc: 23, force: false, dryRun: false })).toBe(true);
  });
  it("skips outside the window (deploy-time PM2 autostart guard)", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: false, dryRun: false })).toBe(false);
  });
  it("runs anyway when FORCE_RUN is set", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: true, dryRun: false })).toBe(true);
  });
  it("runs in dry-run regardless of hour", () => {
    expect(shouldRunNow({ nowHourUtc: 9, cronHourUtc: 23, force: false, dryRun: true })).toBe(true);
  });
});

describe("takeTrendingBudget", () => {
  it("caps the daily seed budget at top-N", () => {
    const titles = Array.from({ length: 50 }, (_, i) => ({ mediaType: "movie" as const, id: i }));
    expect(takeTrendingBudget(titles, 10)).toHaveLength(10);
  });
  it("returns all when fewer than the cap", () => {
    const titles = [{ mediaType: "series" as const, id: 1 }];
    expect(takeTrendingBudget(titles, 10)).toHaveLength(1);
  });
});
