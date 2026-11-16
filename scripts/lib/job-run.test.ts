import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildJobRunRecord, startJobRun, sumWritten, jobRunsFile } from "./job-run.cjs";

const base = {
  job: "imdb-ratings-sync",
  startedAt: Date.parse("2026-11-16T20:00:00Z"),
  endedAt: Date.parse("2026-11-16T20:02:26Z"),
  cpu: { user: 41_000_000, system: 2_500_000 },
  maxRssBytes: 312 * 1024 * 1024,
};

describe("buildJobRunRecord", () => {
  it("emits one Pino-shaped summary with duration, cpu, rss and rows", () => {
    const r = buildJobRunRecord({
      ...base,
      result: { rows: { inserted: 157, updated: 4549, matched: 576154, unchanged: 571448 } },
    });
    expect(r).toMatchObject({
      level: 30,
      event: "job_run_summary",
      job: "imdb-ratings-sync",
      status: "ok",
      durationMs: 146_000,
      cpuUserMs: 41_000,
      cpuSystemMs: 2_500,
      maxRssMb: 312,
      rowsWritten: 4706,
      time: "2026-11-16T20:02:26.000Z",
    });
  });

  it("an error result is level 50 with a truncated message", () => {
    const r = buildJobRunRecord({ ...base, result: { error: new Error("x".repeat(900)) } });
    expect(r.status).toBe("error");
    expect(r.level).toBe(50);
    expect(r.error).toHaveLength(500);
  });
});

describe("sumWritten", () => {
  it("counts write kinds and ignores read/no-op kinds", () => {
    expect(sumWritten({ inserted: 1, updated: 2, deleted: 3, notified: 4, files: 5 })).toBe(15);
    expect(sumWritten({ unchanged: 9, skipped: 9, scanned: 9, matched: 9, selectedMovies: 9, read: 9, keys: 9 })).toBe(0);
    expect(sumWritten(undefined)).toBe(0);
  });
});

describe("startJobRun", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("appends exactly one JSONL line to the monthly file, and finish() is idempotent", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobrun-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let t = Date.parse("2026-11-16T19:00:00Z");
    const run = startJobRun("taste-baseline", { env: { JOB_METRICS_DIR: dir }, now: () => t });
    t += 464_340;
    const rec = run.finish({ rows: { inserted: 44, updated: 120, deleted: 3, keys: 457_673 } });
    expect(run.finish({ status: "error" })).toBeNull();

    const file = jobRunsFile(dir, new Date("2026-11-16T19:07:44Z"));
    expect(path.basename(file)).toBe("job-runs-2026-11.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ job: "taste-baseline", durationMs: 464_340, rowsWritten: 167 });
    expect(rec?.status).toBe("ok");
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("JOB_METRICS_DIR=off logs the line but writes no file", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const append = vi.spyOn(fs, "appendFileSync");
    startJobRun("x", { env: { JOB_METRICS_DIR: "off" } }).finish();
    expect(log).toHaveBeenCalledTimes(1);
    expect(append).not.toHaveBeenCalled();
  });
});
