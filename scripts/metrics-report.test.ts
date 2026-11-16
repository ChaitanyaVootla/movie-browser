import { describe, it, expect } from "vitest";
import { summariseJobs, summariseBox, summariseRenders, rate } from "./metrics-report.cjs";

const box = (time: string, o: Record<string, unknown>) => ({ time, ...o });

describe("rate", () => {
  it("is per-second between samples and null across a counter reset", () => {
    const a = box("2026-11-16T09:00:00Z", { pswpin: 1000 });
    const b = box("2026-11-16T09:05:00Z", { pswpin: 61000 });
    expect(rate(a, b, (x: { pswpin: number }) => x.pswpin)).toBe(200);
    expect(rate(b, a, (x: { pswpin: number }) => x.pswpin)).toBeNull();
  });
});

describe("summariseBox", () => {
  it("buckets by hour with averages, maxima and PG rates", () => {
    const rows = summariseBox([
      box("2026-11-16T09:00:00Z", { load1: 14, swapUsedMb: 1800, pswpin: 0, pswpout: 0, pg: { active: 9, blksRead: 0, xactCommit: 0, longestActiveS: 12 } }),
      box("2026-11-16T09:05:00Z", { load1: 16, swapUsedMb: 1900, pswpin: 150000, pswpout: 90000, pg: { active: 11, blksRead: 3_000_000, xactCommit: 30_000, longestActiveS: 20 } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hour: "2026-11-16T09:00Z",
      samples: 2,
      loadAvg: 15,
      loadMax: 16,
      swapMaxMb: 1900,
      swapInPgS: 500,
      swapOutPgS: 300,
      pgActiveMax: 11,
      pgLongestS: 20,
      pgBlksReadS: 10000,
      pgCommitsS: 100,
    });
  });
});

describe("summariseJobs", () => {
  it("groups runs per job, newest first, with cpu seconds", () => {
    const run = (job: string, startedAt: string, extra = {}) => ({
      job,
      startedAt,
      time: startedAt,
      status: "ok",
      durationMs: 60_000,
      cpuUserMs: 9_000,
      cpuSystemMs: 1_000,
      maxRssMb: 200,
      rowsWritten: 10,
      ...extra,
    });
    const [imdb, taste] = summariseJobs([
      run("imdb-ratings-sync", "2026-11-14T20:00:00Z"),
      run("imdb-ratings-sync", "2026-11-15T20:00:00Z", { status: "error" }),
      run("taste-baseline", "2026-11-15T19:00:00Z"),
    ]);
    expect(imdb).toMatchObject({ job: "imdb-ratings-sync", runs: 2, errors: 1 });
    expect(imdb.recent[0]).toMatchObject({ startedAt: "2026-11-15T20:00:00Z", status: "error", durationS: 60, cpuS: 10 });
    expect(taste.runs).toBe(1);
  });
});

describe("summariseRenders", () => {
  it("sums counts and keeps the worst tail per hour", () => {
    const [h] = summariseRenders([
      { time: "2026-11-16T09:00:00Z", renders: 40, slow: 2, deadline: 0, errors: 1, p50Ms: 900, p95Ms: 31_000, maxActive: 80, eventLoopP99Ms: 300, rssMb: 1400 },
      { time: "2026-11-16T09:01:00Z", renders: 60, slow: 5, deadline: 1, errors: 0, p50Ms: 1100, p95Ms: 45_000, maxActive: 95, eventLoopP99Ms: 900, rssMb: 1500 },
    ]);
    expect(h).toMatchObject({ renders: 100, slow: 7, deadline: 1, errors: 1, p95MsMax: 45_000, activeMax: 95, eventLoopP99MaxMs: 900, rssMaxMb: 1500 });
  });
});
