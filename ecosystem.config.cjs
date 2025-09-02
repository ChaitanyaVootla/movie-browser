module.exports = {
  apps: [
    {
        name: "nuxt",
        script: "export $(cat .env | xargs) && cd .output && node ./server/index.mjs",
        max_memory_restart: "500M",
    },
    {
        name: "vector",
        script: "cd VectorDB && source vector/bin/activate && python3 server.py",
        max_memory_restart: "450M",
    },
    {
        name: "sitemap-generator",
        script: "node",
        args: "scripts/generate-sitemap.js",
        cron_restart: "0 4 * * *",  // Run daily at 4 AM
        autorestart: false,         // Don't restart automatically (cron handles scheduling)
        restart_delay: 5000,        // Wait 5s before restart on failure
        max_restarts: 2,           // Max 2 restart attempts per hour
        min_uptime: "1s",          // Just needs to start properly (exit code determines success)
        watch: false,              // Don't watch for file changes
        max_memory_restart: "500M", // Increased for TMDB data processing
        error_file: "./logs/sitemap-error.log",
        out_file: "./logs/sitemap-out.log",
        log_file: "./logs/sitemap-combined.log",
        time: true,                // Prefix logs with timestamp
        env: {
            NODE_ENV: "production"
        },
        // Kill timeout for stuck processes
        kill_timeout: 300000,      // 5 minutes max execution time
        // PM2 will track success/failure based on exit codes:
        // Exit code 0 = success, non-zero = failure
    },
  ],
};
