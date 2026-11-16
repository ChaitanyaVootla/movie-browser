/**
 * Per-job run metrics: ONE structured summary line per cron run, plus a durable
 * JSONL copy outside the deploy dir. Reader: `node scripts/metrics-report.cjs`.
 *
 * WHY (Nov 16 2026, web-1 = 2 vCPU / 4 GB): job cost was only knowable by
 * scraping each job's free-text log (emoji lines, different formats per job),
 * and PM2 shows every job as `waiting restart` whether it ran, skipped or died.
 * The nightly popularity sync rewrote ~75% of movies for 12h before anyone
 * measured it. Every job now ends with a record of how long it ran, how much CPU
 * its own process burned, peak RSS, and how many rows it actually wrote.
 *
 * Cost: one `console.log` + one `fs.appendFileSync` of ~300 bytes per run.
 * Never throws: metrics must not fail a job.
 *
 * Plain CJS, zero deps, so it loads from `tsx` (.ts), ESM (`generate-sitemap.js`)
 * and CJS (`prune-isr-cache.js`) scripts alike.
 *
 * Usage:
 *   const { startJobRun } = require("./lib/job-run.cjs");   // or import
 *   const run = startJobRun("imdb-ratings-sync");
 *   ... work ...
 *   run.finish({ rows: { inserted, updated, unchanged } });       // status ok
 *   run.finish({ status: "error", error });                       // on failure
 *
 * Env: JOB_METRICS_DIR (default ~/metrics; "off" disables the file copy).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

/** Where the durable copy goes. Outside the app dir so deploys never touch it. */
function metricsDir(env = process.env) {
  const dir = env.JOB_METRICS_DIR;
  if (dir === "off") return null;
  return dir || path.join(os.homedir(), "metrics");
}

/** Monthly file: ~30 jobs/day × 300 B ≈ 300 KB/month, no rotation needed. */
function jobRunsFile(dir, date) {
  return path.join(dir, `job-runs-${date.toISOString().slice(0, 7)}.jsonl`);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return error === undefined ? undefined : String(error);
}

/**
 * Build the summary record. Pure (everything comes in as arguments) so it is
 * unit-tested; the shape is Pino-compatible (level/time/event) so the same line
 * reads like every other structured log on the box.
 */
function buildJobRunRecord({ job, startedAt, endedAt, cpu, maxRssBytes, result = {} }) {
  const status = result.status || (result.error ? "error" : "ok");
  const record = {
    level: status === "error" ? 50 : 30,
    time: new Date(endedAt).toISOString(),
    event: "job_run_summary",
    job,
    status,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Math.max(0, endedAt - startedAt),
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
    maxRssMb: Math.round(maxRssBytes / (1024 * 1024)),
    rows: result.rows || {},
    rowsWritten: sumWritten(result.rows),
  };
  const msg = errorMessage(result.error);
  if (msg) record.error = msg.slice(0, 500);
  if (result.extra) record.extra = result.extra;
  return record;
}

/** Rows that cost a write: everything except keys named unchanged/skipped/scanned/matched. */
const NON_WRITE_KEYS = /^(unchanged|skipped|scanned|matched|selected|read|total|keys)/i;
function sumWritten(rows) {
  if (!rows) return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(rows)) {
    if (typeof v === "number" && Number.isFinite(v) && !NON_WRITE_KEYS.test(k)) sum += v;
  }
  return sum;
}

/** Peak RSS of this process. `resourceUsage().maxRSS` is in KB on Linux. */
function peakRssBytes() {
  try {
    return process.resourceUsage().maxRSS * 1024;
  } catch {
    return process.memoryUsage().rss;
  }
}

/**
 * Start timing a job. `finish()` is idempotent (first call wins), so a job can
 * call it on success and again from a catch-all without double-recording.
 */
function startJobRun(job, { env = process.env, now = Date.now } = {}) {
  const startedAt = now();
  const cpuStart = process.cpuUsage();
  let done = false;
  return {
    finish(result = {}) {
      if (done) return null;
      done = true;
      try {
        const record = buildJobRunRecord({
          job,
          startedAt,
          endedAt: now(),
          cpu: process.cpuUsage(cpuStart),
          maxRssBytes: peakRssBytes(),
          result,
        });
        const line = JSON.stringify(record);
        console.log(line);
        const dir = metricsDir(env);
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          fs.appendFileSync(jobRunsFile(dir, new Date(record.time)), line + "\n");
        }
        return record;
      } catch {
        return null; // metrics must never fail the job
      }
    },
  };
}

module.exports = { startJobRun, buildJobRunRecord, sumWritten, metricsDir, jobRunsFile };
