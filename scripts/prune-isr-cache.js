/**
 * ISR route-cache prune — keeps `.next/server/app/{movie,series,person}` under
 * a disk budget.
 *
 * WHY THIS EXISTS (Jun 10 2026 outage): Next.js never evicts on-demand ISR
 * disk entries. The bot fleet crawling the 800k-title long tail wrote unique
 * cache files until `.next` hit 41GB and the 77GB disk hit ENOSPC — next-server
 * SIGABRT'd on writes and prod flapped DOWN/SLOW for hours. Deploys wipe the
 * cache, but between deploys growth is unbounded without this job.
 *
 * Strategy (cheap → thorough):
 *   1. Fast exit if the cache roots are under ISR_CACHE_BUDGET_MB.
 *   2. Delete entries older than ISR_CACHE_MAX_AGE_HOURS (stale for crawlers,
 *      will re-render on demand; revalidate is 1h movie/series, 24h person).
 *   3. If still over budget, delete oldest-first until under budget.
 *
 * Deleting .html/.rsc/.meta files is always safe — Next treats a missing entry
 * as a cache miss and re-renders. Identical to what every deploy already does.
 *
 * Carries the standard cron-window guard: PM2 runs cron_restart jobs once on
 * every `pm2 start` (= every deploy); without the guard this would walk the
 * cache tree at peak traffic. FORCE_RUN=1 to run manually:
 *   FORCE_RUN=1 nice -n 19 node scripts/prune-isr-cache.js
 */

const fs = require("fs");
const path = require("path");

const CRON_HOUR_UTC = parseInt(process.env.CRON_HOUR_UTC || "23", 10);
const BUDGET_BYTES =
  parseInt(process.env.ISR_CACHE_BUDGET_MB || "5000", 10) * 1024 * 1024;
const MAX_AGE_MS =
  parseInt(process.env.ISR_CACHE_MAX_AGE_HOURS || "72", 10) * 3600 * 1000;

const CACHE_ROOTS = ["movie", "series", "person"].map((d) =>
  path.join(process.cwd(), ".next", "server", "app", d),
);

const CACHE_EXTENSIONS = new Set([".html", ".rsc", ".meta"]);

if (process.env.FORCE_RUN !== "1" && new Date().getUTCHours() !== CRON_HOUR_UTC) {
  console.log(
    `[prune-isr-cache] Outside cron window (now=${new Date().getUTCHours()}h UTC, window=${CRON_HOUR_UTC}h) — exiting (deploy-time autostart guard).`,
  );
  process.exit(0);
}

/** Recursively collect cache entry files. Sync walk is fine: the job is niced
 * and the entry count (not throughput) is the constraint. */
function collectEntries(dir, out) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // root may not exist on a fresh deploy
  }
  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      collectEntries(full, out);
    } else if (CACHE_EXTENSIONS.has(path.extname(dirent.name))) {
      try {
        const stat = fs.statSync(full);
        out.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // raced with a concurrent revalidation write/unlink — skip
      }
    }
  }
}

function remove(entry) {
  try {
    fs.unlinkSync(entry.path);
    return entry.size;
  } catch {
    return 0;
  }
}

const startedAt = Date.now();
const entries = [];
for (const root of CACHE_ROOTS) collectEntries(root, entries);

const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
const totalGB = (totalBytes / 1024 ** 3).toFixed(2);
console.log(
  `[prune-isr-cache] ${entries.length} cache files, ${totalGB}GB (budget ${(BUDGET_BYTES / 1024 ** 3).toFixed(1)}GB).`,
);

if (totalBytes <= BUDGET_BYTES) {
  console.log("[prune-isr-cache] Under budget — nothing to do.");
  process.exit(0);
}

let freed = 0;
let deleted = 0;
const ageCutoff = Date.now() - MAX_AGE_MS;

// Pass 1: age-based
for (const entry of entries) {
  if (entry.mtimeMs < ageCutoff) {
    freed += remove(entry);
    deleted += 1;
    entry.removed = true;
  }
}

// Pass 2: oldest-first down to budget
if (totalBytes - freed > BUDGET_BYTES) {
  const remaining = entries
    .filter((e) => !e.removed)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of remaining) {
    if (totalBytes - freed <= BUDGET_BYTES) break;
    freed += remove(entry);
    deleted += 1;
  }
}

console.log(
  `[prune-isr-cache] Deleted ${deleted} files, freed ${(freed / 1024 ** 3).toFixed(2)}GB in ${Math.round((Date.now() - startedAt) / 1000)}s.`,
);
