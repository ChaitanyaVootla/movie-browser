// PM2 Configuration for Next.js App
// This config is for the NEW Next.js app only
// The legacy Nuxt app has its own deployment on a separate branch
//
// NOTE on cron jobs: PM2 runs cron_restart apps once on EVERY `pm2 start`
// (i.e. on every deploy). Both job scripts carry a cron-window guard
// (CRON_HOUR_UTC) so deploy-time autostarts exit immediately instead of
// hammering the 2-vCPU box at peak. To run one manually:
//   FORCE_RUN=1 npx tsx scripts/sync-popularity.ts
//   FORCE_RUN=1 node scripts/generate-sitemap.js
// Jobs run under `nice -n 19` so next-server always wins the CPU.
// Schedules sit in the true low-traffic window for the India-heavy audience
// (21:00/22:00 UTC = 02:30/03:30 IST).

module.exports = {
  apps: [
    {
      name: "next",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "npm",
      args: "start",
      // RSS plateaus at ~1.2-1.4GB under load; 600M caused theoretical
      // restart-cycling risk (PM2 memory enforcement is unreliable in this
      // setup, but keep the value honest).
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        // --heapsnapshot-signal: `kill -USR2 <next-server pid>` writes a
        // Heap.<ts>.heapsnapshot to cwd for leak diagnosis (Jun 11: RSS crept
        // to ~5GB under crawler load; PM2 max_memory_restart didn't enforce).
        // --max-old-space-size caps the JS heap so a leak degrades to GC
        // pressure + a clean OOM restart instead of eating the 8GB box.
        NODE_OPTIONS: "--heapsnapshot-signal=SIGUSR2 --max-old-space-size=3072",
      },
    },
    // Popularity Sync - daily at 21:00 UTC (02:30 IST)
    // Downloads TMDB daily exports (streaming) and updates changed popularity
    // rows for movies, series, persons.
    {
      name: "popularity-sync",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "bash",
      args: ["-c", "exec nice -n 19 npx tsx scripts/sync-popularity.ts"],
      cron_restart: "0 21 * * *",
      autorestart: false,
      restart_delay: 5000,
      max_restarts: 2,
      min_uptime: "1s",
      watch: false,
      max_memory_restart: "900M",
      error_file: "./logs/popularity-sync-error.log",
      out_file: "./logs/popularity-sync-out.log",
      log_file: "./logs/popularity-sync-combined.log",
      time: true,
      env: { NODE_ENV: "production", CRON_HOUR_UTC: "21" },
      kill_timeout: 600000, // 10 minutes - downloads large files
    },
    // Sitemap Generator - daily at 22:00 UTC (03:30 IST), after popularity
    {
      name: "sitemap-generator",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "bash",
      args: [
        "-c",
        "exec nice -n 19 node --max-old-space-size=1024 --optimize-for-size scripts/generate-sitemap.js",
      ],
      cron_restart: "0 22 * * *",
      autorestart: false,
      restart_delay: 5000,
      max_restarts: 2,
      min_uptime: "1s",
      watch: false,
      max_memory_restart: "800M",
      error_file: "./logs/sitemap-error.log",
      out_file: "./logs/sitemap-out.log",
      log_file: "./logs/sitemap-combined.log",
      time: true,
      env: { NODE_ENV: "production", CRON_HOUR_UTC: "22" },
      kill_timeout: 300000, // 5 minutes - sitemap gen can take a while
    },
    // ISR cache prune - every 6h. Jun 10 2026: unbounded ISR route-cache
    // entries (bot fleet × 800k-title long tail) grew .next to 41GB and filled
    // the 77GB disk → ENOSPC outage loop. Primary bound is now the custom
    // cache-handler.cjs (LRU at write time); this job is the belt-and-braces
    // backstop for anything else under .next. FORCE_RUN=1 skips the
    // deploy-autostart guard safely: the script fast-exits when under budget.
    {
      name: "isr-cache-prune",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "bash",
      args: [
        "-c",
        "exec nice -n 19 node --max-old-space-size=512 scripts/prune-isr-cache.js",
      ],
      cron_restart: "0 */6 * * *",
      autorestart: false,
      restart_delay: 5000,
      max_restarts: 2,
      min_uptime: "1s",
      watch: false,
      max_memory_restart: "600M",
      error_file: "./logs/isr-prune-error.log",
      out_file: "./logs/isr-prune-out.log",
      log_file: "./logs/isr-prune-combined.log",
      time: true,
      // FORCE_RUN=1: no hour guard — runs every 6h AND once per deploy, both
      // safe because the script exits in seconds when under budget.
      env: { NODE_ENV: "production", FORCE_RUN: "1" },
      kill_timeout: 600000, // 10 minutes - may unlink hundreds of thousands of files
    },
  ],
};
