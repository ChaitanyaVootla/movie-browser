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
      // Port 3009 (uncommon) keeps the default :3000 free for other tooling.
      //
      // GOTCHA — the `.md` twin layer CANNOT be exercised on this port. Next
      // builds its internal absolute URLs on the :3000 default regardless of
      // `-p` (and regardless of a matching PORT env — both were tested), so
      // `req.nextUrl.origin` inside src/proxy.ts reports localhost:3000. The
      // proxy's `.md` branch rewrites via a cloned nextUrl, which Next then
      // considers CROSS-origin and tries to HTTP-proxy to :3000 → 500 with
      // "Failed to proxy http://localhost:3000/api/md?p=… ECONNREFUSED".
      // To test `.md` locally, run dev on the DEFAULT port instead:
      //   npx pm2 stop mb-dev && npx next dev --turbo -p 3000
      // Even then the rewrite's query string is dropped in dev, so /api/md
      // answers `400 p: expected string, received null` — a dev-only artifact
      // (prod serves the real markdown). Hit /api/md?p=/browse directly to
      // exercise the renderers. Prod is unaffected: it sets PORT and its
      // origin is consistent. Same family as the redirect-origin gotcha in
      // .claude/rules/performance.md.
      args: "dev --turbo -p 3009",
      interpreter: "node",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "development",
        // Set for anything that reads PORT, but be warned it does NOT fix the
        // rewrite-origin problem described above the `args` line — measured, not
        // assumed: with PORT=3009 set, `.md` still tried to proxy to :3000.
        PORT: "3009",
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
