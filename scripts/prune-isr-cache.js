/**
 * Disk-cache prune — keeps Next's on-disk caches under a budget:
 *   1. ISR route cache  — `.next/server/app/{movie,series,person}` (.html/.rsc/.meta)
 *   2. Image optimizer  — `.next/cache/images` (all files; any format)
 *
 * WHY THIS EXISTS:
 * - Jun 10 2026 outage: Next's default ISR disk cache never evicts by size. The
 *   bot fleet crawling the 800k-title long tail wrote unique route-cache files
 *   until `.next` hit 41GB and the 77GB disk hit ENOSPC — next-server SIGABRT'd
 *   on writes and prod flapped DOWN/SLOW for hours.
 * - Jun 19 2026 outage (the reason image pruning was added): the SAME failure
 *   recurred, but the hog this time was `.next/cache/images`. Next's image
 *   optimizer (`next/image`, no `unoptimized`) caches every (url,width,format)
 *   variant on disk with NO total-size limit. `cache-handler.cjs` bounds only
 *   `bounded-isr`; this job only pruned `server/app`. Nothing capped the image
 *   cache, so it grew unbounded (≈0.5GB/h under crawl) and filled the disk —
 *   which then killed the PM2 daemon that hosts THIS job, removing the only
 *   self-heal (see `scripts/disk-guard.sh` for the PM2-independent failsafe).
 *
 * Strategy per target (cheap → thorough):
 *   1. Fast exit if the target is under its budget.
 *   2. Delete entries older than ISR_CACHE_MAX_AGE_HOURS (stale for crawlers;
 *      Next re-renders/re-optimizes on demand — identical to a deploy wipe).
 *   3. If still over budget, delete oldest-first until under budget.
 *
 * Deleting any of these files is always safe — Next treats a missing entry as a
 * cache miss and regenerates it. Exactly what every deploy already does.
 *
 * Carries the standard cron-window guard: PM2 runs cron_restart jobs once on
 * every `pm2 start` (= every deploy); without the guard this would walk the
 * cache tree at peak traffic. FORCE_RUN=1 to run manually (the PM2 job + the
 * deploy step + disk-guard.sh all set it — safe because each target fast-exits
 * when under budget):
 *   FORCE_RUN=1 nice -n 19 node scripts/prune-isr-cache.js
 *
 * Env: ISR_CACHE_BUDGET_MB (default 5000), IMAGE_CACHE_BUDGET_MB (default 3000),
 *      ISR_CACHE_MAX_AGE_HOURS (default 72), CRON_HOUR_UTC (default 23).
 */

const fs = require("fs");
const path = require("path");

const CRON_HOUR_UTC = parseInt(process.env.CRON_HOUR_UTC || "23", 10);
const ISR_BUDGET_BYTES =
  parseInt(process.env.ISR_CACHE_BUDGET_MB || "5000", 10) * 1024 * 1024;
const IMAGE_BUDGET_BYTES =
  parseInt(process.env.IMAGE_CACHE_BUDGET_MB || "3000", 10) * 1024 * 1024;
const MAX_AGE_MS =
  parseInt(process.env.ISR_CACHE_MAX_AGE_HOURS || "72", 10) * 3600 * 1000;

const ISR_EXTENSIONS = new Set([".html", ".rsc", ".meta"]);

/** Recursively collect cache entry files. Sync walk is fine: the job is niced
 * and the entry count (not throughput) is the constraint. `extFilter` null =
 * collect every file (image cache files have no fixed extension). */
function collectEntries(dir, out, extFilter) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // root may not exist on a fresh deploy
  }
  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      collectEntries(full, out, extFilter);
    } else if (!extFilter || extFilter.has(path.extname(dirent.name))) {
      try {
        const stat = fs.statSync(full);
        out.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // raced with a concurrent revalidation write/unlink — skip
      }
    }
  }
  return out;
}

function remove(entry) {
  try {
    fs.unlinkSync(entry.path);
    return entry.size;
  } catch {
    return 0;
  }
}

/**
 * Prune one cache target to its byte budget. Returns
 * {scanned, totalBytes, deleted, freed}. Pure-ish (only touches disk) so it is
 * unit-testable against a temp dir.
 */
function pruneTarget(label, roots, budgetBytes, extFilter, now) {
  const entries = [];
  for (const root of roots) collectEntries(root, entries, extFilter);

  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  if (totalBytes <= budgetBytes) {
    return { scanned: entries.length, totalBytes, deleted: 0, freed: 0 };
  }

  let freed = 0;
  let deleted = 0;
  const ageCutoff = now - MAX_AGE_MS;

  // Pass 1: age-based.
  for (const entry of entries) {
    if (entry.mtimeMs < ageCutoff) {
      freed += remove(entry);
      deleted += 1;
      entry.removed = true;
    }
  }

  // Pass 2: oldest-first down to budget.
  if (totalBytes - freed > budgetBytes) {
    const remaining = entries
      .filter((e) => !e.removed)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of remaining) {
      if (totalBytes - freed <= budgetBytes) break;
      freed += remove(entry);
      deleted += 1;
    }
  }

  return { scanned: entries.length, totalBytes, deleted, freed };
}

/** Remove now-empty directories left behind under a root (the image cache
 * creates one dir per source image; pruning their files orphans the dirs and
 * slowly leaks inodes). Best-effort, depth-first. */
function removeEmptyDirs(dir) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of dirents) {
    if (dirent.isDirectory()) removeEmptyDirs(path.join(dir, dirent.name));
  }
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {
    /* not empty / raced — leave it */
  }
}

function run(cwd, now) {
  const gb = (b) => (b / 1024 ** 3).toFixed(2);
  const targets = [
    {
      label: "isr",
      roots: ["movie", "series", "person"].map((d) =>
        path.join(cwd, ".next", "server", "app", d),
      ),
      budget: ISR_BUDGET_BYTES,
      ext: ISR_EXTENSIONS,
    },
    {
      label: "images",
      roots: [path.join(cwd, ".next", "cache", "images")],
      budget: IMAGE_BUDGET_BYTES,
      ext: null, // any extension
    },
  ];

  let totalFreed = 0;
  for (const t of targets) {
    const startedAt = now;
    const r = pruneTarget(t.label, t.roots, t.budget, t.ext, now);
    totalFreed += r.freed;
    if (r.deleted === 0) {
      console.log(
        `[prune-isr-cache] ${t.label}: ${r.scanned} files, ${gb(r.totalBytes)}GB (budget ${(t.budget / 1024 ** 3).toFixed(1)}GB) — under budget.`,
      );
    } else {
      if (t.ext === null) for (const root of t.roots) removeEmptyDirs(root);
      console.log(
        `[prune-isr-cache] ${t.label}: ${r.scanned} files, ${gb(r.totalBytes)}GB → deleted ${r.deleted}, freed ${gb(r.freed)}GB in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
      );
    }
  }
  return totalFreed;
}

// Run only when invoked directly (not when required by the unit test).
if (require.main === module) {
  if (
    process.env.FORCE_RUN !== "1" &&
    new Date().getUTCHours() !== CRON_HOUR_UTC
  ) {
    console.log(
      `[prune-isr-cache] Outside cron window (now=${new Date().getUTCHours()}h UTC, window=${CRON_HOUR_UTC}h) — exiting (deploy-time autostart guard).`,
    );
    process.exit(0);
  }
  run(process.cwd(), Date.now());
}

module.exports = {
  collectEntries,
  pruneTarget,
  removeEmptyDirs,
  run,
};
