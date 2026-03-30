// PM2 Configuration for Next.js App
// This config is for the NEW Next.js app only
// The legacy Nuxt app has its own deployment on a separate branch

module.exports = {
  apps: [
    {
      name: "next",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "npm",
      args: "start",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
    },
    // Popularity Sync - runs daily at 3 AM UTC
    // Downloads TMDB daily exports and updates popularity for movies, series, persons
    {
      name: "popularity-sync",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "npx",
      args: "tsx scripts/sync-popularity.ts",
      cron_restart: "0 3 * * *", // 3 AM daily (before sitemap at 4 AM)
      autorestart: false,
      restart_delay: 5000,
      max_restarts: 2,
      min_uptime: "1s",
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/popularity-sync-error.log",
      out_file: "./logs/popularity-sync-out.log",
      log_file: "./logs/popularity-sync-combined.log",
      time: true,
      env: { NODE_ENV: "production" },
      kill_timeout: 600000, // 10 minutes - downloads large files
    },
    // Sitemap Generator - runs daily at 4 AM UTC
    // Downloads TMDB daily exports and generates sitemaps to public/
    {
      name: "sitemap-generator",
      cwd: "/home/ubuntu/movie-browser-next",
      script: "node",
      args: "--max-old-space-size=1024 --optimize-for-size scripts/generate-sitemap.js",
      cron_restart: "0 4 * * *", // 4 AM daily
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
      env: { NODE_ENV: "production" },
      kill_timeout: 300000, // 5 minutes - sitemap gen can take a while
    },
  ],
};
