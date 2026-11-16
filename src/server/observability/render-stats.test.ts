import { describe, it, expect } from "vitest";
import { RenderStatsWindow, buildRenderStatsLine } from "./render-stats";

describe("RenderStatsWindow", () => {
  it("counts outcomes, percentiles and peak concurrency, then resets", () => {
    const w = new RenderStatsWindow();
    for (const d of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) w.record(d, "ok");
    w.record(2000, "error");
    w.record(90_000, "deadline");
    w.markSlow();
    w.observeActive(12);
    w.observeActive(7);

    const s = w.take();
    expect(s).toMatchObject({ renders: 12, ok: 10, errors: 1, deadline: 1, slow: 1, maxActive: 12, maxMs: 90_000 });
    expect(s.p50Ms).toBe(700);
    expect(s.p95Ms).toBe(90_000);

    expect(w.take()).toMatchObject({ renders: 0, p50Ms: null, p95Ms: null, maxMs: null, maxActive: 0, slow: 0 });
  });
});

describe("buildRenderStatsLine", () => {
  it("converts event-loop ns to ms and memory to MB", () => {
    const line = buildRenderStatsLine(new RenderStatsWindow().take(), {
      intervalMs: 60_000,
      active: 3,
      abandoned: 0,
      eventLoop: { p50: 21e6, p99: 480e6, max: 1.2e9 },
      mem: { rss: 1443 * 1048576, heapUsed: 700 * 1048576, heapTotal: 0, external: 90 * 1048576, arrayBuffers: 0 },
      load: [15.29, 14.5, 13.9],
      now: new Date("2026-11-16T09:30:00Z"),
    });
    expect(line).toMatchObject({
      event: "render_stats",
      eventLoopP50Ms: 21,
      eventLoopP99Ms: 480,
      eventLoopMaxMs: 1200,
      rssMb: 1443,
      heapUsedMb: 700,
      load1: 15.29,
      active: 3,
    });
  });
});
