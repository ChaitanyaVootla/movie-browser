// LOCAL dev server under PM2 (NOT for prod — prod uses ecosystem.config.cjs on EC2).
// Runs `next dev --turbo` against the local dev DB on :5436 with the social
// feature flags. PM2's env block is set in process.env BEFORE Next loads, and
// Next does NOT override already-set process.env vars from .env — so this
// DATABASE_URL wins over the prod-tunneled one in .env. (Other vars like AWS
// creds still load from .env via Next.)
//
//   npx pm2 start ecosystem.dev.config.cjs    # start
//   npx pm2 restart mb-dev                     # restart after a schema/client change
//   npx pm2 logs mb-dev                        # tail logs
//   npx pm2 stop mb-dev / npx pm2 delete mb-dev
module.exports = {
  apps: [
    {
      name: "mb-dev",
      cwd: "/Users/chaitanya/dev/movie-browser",
      script: "node_modules/next/dist/bin/next",
      args: "dev --turbo",
      interpreter: "node",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://dev:dev@localhost:5436/moviebrowser",
        USER_DATA_SOURCE: "postgres",
        ENABLE_MONGODB_ENRICHMENT: "false",
        // Local-only test session (triple-gated; crashes boot if ever seen in prod).
        ENABLE_TEST_AUTH: "true",
        // Disable analytics locally: .env points CLICKHOUSE_HOST at the prod
        // instance (unreachable without a tunnel), so every request otherwise
        // pays a multi-second connect-timeout. Empty host => getConfig() returns
        // null => tracking no-ops (src/lib/analytics/client.ts).
        CLICKHOUSE_HOST: "",
        CLICKHOUSE_PASSWORD: "",
        // Local catalog is sparse, so every detail-page visit would trigger a
        // background TMDB refresh + progressive enrichment (Bedrock/Cohere) that
        // never settles locally, plus a 120s SSE poll — these STACK per
        // navigation and saturate the single dev thread (compile itself crept to
        // 45s). 0 disables background refresh/enrichment (hydration/index.ts).
        MAX_BACKGROUND_REFRESH: "0",
      },
    },
  ],
};
