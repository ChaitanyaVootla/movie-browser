#!/usr/bin/env node
/**
 * Summarise the box's durable metrics (~/metrics):
 *   job-runs-YYYY-MM.jsonl      one `job_run_summary` per cron run (scripts/lib/job-run.cjs)
 *   box-YYYY-MM-DD.jsonl        5-min box + Postgres samples       (scripts/box-stats.sh)
 *   render-stats-YYYY-MM-DD.jsonl  1-min render/process stats      (render-stats.ts)
 *
 *   node scripts/metrics-report.cjs                 # last 24h
 *   node scripts/metrics-report.cjs --hours 72
 *   node scripts/metrics-report.cjs --dir /path/to/metrics --json
 *
 * Reads only small local files; safe to run on the box at any time.
 * See performance.md → "Metrics: where time and resources go".
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function readJsonl(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* torn last line while a writer appends — skip */
    }
  }
  return out;
}

function loadSince(dir, prefix, sinceMs) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  return names
    .sort()
    .flatMap((n) => readJsonl(path.join(dir, n)))
    .filter((r) => Date.parse(r.time) >= sinceMs)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

const hourOf = (iso) => iso.slice(0, 13) + ":00Z";
const round = (n, d = 1) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);
const max = (xs) => (xs.length ? Math.max(...xs) : null);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs) => xs.filter((x) => typeof x === "number" && Number.isFinite(x));

/** Per-job: runs, last status, duration/cpu/rows of each run (newest first). */
function summariseJobs(runs) {
  const byJob = new Map();
  for (const r of runs) {
    if (!byJob.has(r.job)) byJob.set(r.job, []);
    byJob.get(r.job).push(r);
  }
  return [...byJob.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([job, list]) => ({
      job,
      runs: list.length,
      errors: list.filter((r) => r.status === "error").length,
      recent: list
        .slice(-5)
        .reverse()
        .map((r) => ({
          startedAt: r.startedAt,
          status: r.status,
          durationS: round(r.durationMs / 1000),
          cpuS: round((r.cpuUserMs + r.cpuSystemMs) / 1000),
          maxRssMb: r.maxRssMb,
          rowsWritten: r.rowsWritten,
        })),
    }));
}

/** Rate of a cumulative counter between consecutive samples (resets → skipped). */
function rate(prev, cur, get) {
  const a = get(prev);
  const b = get(cur);
  const dt = (Date.parse(cur.time) - Date.parse(prev.time)) / 1000;
  if (typeof a !== "number" || typeof b !== "number" || dt <= 0 || b < a) return null;
  return (b - a) / dt;
}

/** Hourly box view: load, swap, PSI, PG activity and IO/commit rates. */
function summariseBox(samples) {
  const hours = new Map();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[i - 1];
    const h = hourOf(s.time);
    if (!hours.has(h)) hours.set(h, []);
    hours.get(h).push({
      s,
      swapIn: prev ? rate(prev, s, (x) => x.pswpin) : null,
      swapOut: prev ? rate(prev, s, (x) => x.pswpout) : null,
      blksRead: prev ? rate(prev, s, (x) => x.pg && x.pg.blksRead) : null,
      commits: prev ? rate(prev, s, (x) => x.pg && x.pg.xactCommit) : null,
    });
  }
  return [...hours.entries()].map(([hour, rows]) => ({
    hour,
    samples: rows.length,
    loadAvg: round(avg(nums(rows.map((r) => r.s.load1))), 2),
    loadMax: round(max(nums(rows.map((r) => r.s.load1))), 2),
    psiCpu: round(avg(nums(rows.map((r) => r.s.psiCpu60)))),
    psiIo: round(avg(nums(rows.map((r) => r.s.psiIo60)))),
    swapMaxMb: max(nums(rows.map((r) => r.s.swapUsedMb))),
    swapInPgS: round(avg(nums(rows.map((r) => r.swapIn)))),
    swapOutPgS: round(avg(nums(rows.map((r) => r.swapOut)))),
    nextRssMaxMb: max(nums(rows.map((r) => r.s.nextRssMb))),
    pgActiveMax: max(nums(rows.map((r) => r.s.pg && r.s.pg.active))),
    pgLongestS: max(nums(rows.map((r) => r.s.pg && r.s.pg.longestActiveS))),
    pgBlksReadS: round(avg(nums(rows.map((r) => r.blksRead)))),
    pgCommitsS: round(avg(nums(rows.map((r) => r.commits)))),
  }));
}

/** Hourly render view from the 1-min `render_stats` lines. */
function summariseRenders(lines) {
  const hours = new Map();
  for (const l of lines) {
    const h = hourOf(l.time);
    if (!hours.has(h)) hours.set(h, []);
    hours.get(h).push(l);
  }
  return [...hours.entries()].map(([hour, ls]) => ({
    hour,
    renders: ls.reduce((a, l) => a + (l.renders || 0), 0),
    slow: ls.reduce((a, l) => a + (l.slow || 0), 0),
    deadline: ls.reduce((a, l) => a + (l.deadline || 0), 0),
    errors: ls.reduce((a, l) => a + (l.errors || 0), 0),
    p50MsMedian: round(median(nums(ls.map((l) => l.p50Ms))), 0),
    p95MsMax: max(nums(ls.map((l) => l.p95Ms))),
    activeMax: max(nums(ls.map((l) => l.maxActive))),
    eventLoopP99MaxMs: max(nums(ls.map((l) => l.eventLoopP99Ms))),
    rssMaxMb: max(nums(ls.map((l) => l.rssMb))),
  }));
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function table(rows) {
  if (!rows.length) return "  (no data)\n";
  const cols = Object.keys(rows[0]);
  const fmt = (v) => (v === null || v === undefined ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c]).length)));
  const line = (vals) => "  " + vals.map((v, i) => v.padStart(widths[i])).join("  ");
  return [line(cols), ...rows.map((r) => line(cols.map((c) => fmt(r[c]))))].join("\n") + "\n";
}

function main(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const dir = arg("--dir", process.env.JOB_METRICS_DIR || path.join(os.homedir(), "metrics"));
  const hours = Number(arg("--hours", "24"));
  const since = Date.now() - hours * 3600 * 1000;
  const report = {
    dir,
    hours,
    jobs: summariseJobs(loadSince(dir, "job-runs-", since)),
    box: summariseBox(loadSince(dir, "box-", since)),
    renders: summariseRenders(loadSince(dir, "render-stats-", since)),
  };
  if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`metrics from ${dir}, last ${hours}h\n`);
  console.log("JOBS (newest run first)");
  for (const j of report.jobs) {
    console.log(`- ${j.job}: ${j.runs} run(s), ${j.errors} error(s)`);
    process.stdout.write(table(j.recent));
  }
  if (!report.jobs.length) console.log("  (no data)");
  console.log("\nBOX + POSTGRES (hourly; rates per second)");
  process.stdout.write(table(report.box));
  console.log("\nRENDERS (hourly)");
  process.stdout.write(table(report.renders));
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { summariseJobs, summariseBox, summariseRenders, rate, readJsonl, loadSince };
