# Enrichment Scraper (ratings + deep links) — v2, Oct 2026

Where IMDb / Rotten Tomatoes / Metacritic / Letterboxd ratings and per-title
streaming deep links come from, how to tell if a source is broken, and the
traps that made the old scraper silently useless for months.

## Topology

| Data | Source | Path |
|------|--------|------|
| IMDb rating + votes | IMDb official dataset `title.ratings.tsv.gz` (daily, ~8.7MB) | PM2 `imdb-ratings-sync` 20:00 UTC → `scripts/sync-imdb-ratings.ts` |
| RT critic + audience (+consensus, certified) | rottentomatoes.com `#media-scorecard-json` | Lambda `movie-ratings-scraper-beta` |
| Metacritic | metacritic.com JSON-LD | Lambda |
| Letterboxd (0–5, films only) | `letterboxd.com/tmdb/{id}/` redirect → JSON-LD | Lambda |
| Deep links IN/US/GB/CA/AU | JustWatch GraphQL `apis.justwatch.com/graphql`, node matched by **tmdbId** | Lambda |
| RT/MC/LB/Netflix… ids | Wikidata `wbgetentities` (lookup by IMDb/TMDB id when TMDB has no QID) | Lambda |
| Google audience % | **nothing** — no longer refreshed (old values still display) | — |

Lambda source: `lambda/` (TypeScript, zero runtime deps, global `fetch`, no
Chromium; arm64 / 256MB / 30s; ~10KB zip). App client:
`src/server/services/hydration/sources/lambda.ts`. Called from the hydration
background refresh (never the render path), deduped + capped by
`MAX_BACKGROUND_REFRESH`.

## Per-source status — the whole point of v2

Every source returns ONE of `ok | empty | not_found | no_id | blocked |
http_error | parse_error | timeout | error | skipped` (`lambda/lib/result.ts`).
- **`blocked` and `parse_error` mean a human must look** (bot wall / markup
  change). `not_found`/`no_id` are NORMAL for long-tail titles — on a random
  popularity 1–3 sample only ~42% of titles exist on any source.
- Emitted three ways: one `enrich.summary` JSON line per call in CloudWatch;
  one ClickHouse `api_calls` row per source (`service='scraper'`,
  `method='SCRAPE'`, `error_type=<status>`, endpoint `<source>:<type>:<id>`);
  admin → Lambda tab → **Scraper sources** table.
- Alarms (SNS `movie-browser-alerts`, CLI-created, not in TF):
  `scraper-sources-broken` (metric filter `ScraperBrokenCalls` = summaries with
  `broken > 0`, ≥40/h for 2h) and `scraper-silent` (<10 invocations / 6h).

Triage:
```
# CloudWatch Logs Insights on /aws/lambda/movie-ratings-scraper-beta
filter msg = "enrich.summary" | stats count() by sources.rt.status, sources.justwatch.status
filter msg = "enrich.summary" and broken > 0 | stats count() by brokenSources.0
# ClickHouse
SELECT splitByChar(':', endpoint)[1] src, error_type, count() FROM api_calls
WHERE service='scraper' AND timestamp > now() - INTERVAL 1 DAY GROUP BY src, error_type ORDER BY src
```
Live check of the deployed function: `cd lambda && node scripts/smoke.js --lambda movie-ratings-scraper-beta`
(needs the project AWS creds + root `node_modules`).

## Traps that killed v1 (do not reintroduce)

1. **A 2xx is not success.** IMDb's WAF answers AWS IPs with `202` + empty
   body; v1 accepted it, parsed nothing, and logged "Successfully scraped" with
   `rating: null` — 9,103/9,103 calls on Oct 7 2026, unnoticed for months.
   `lib/http.ts` `looksLikeChallenge` classifies 202-empty / challenge pages as
   `blocked`. Never scrape IMDb per-title from Lambda; use the dataset.
2. **Hard-coded obfuscated CSS classes rot.** The Google Lambda
   (`puppeteer-node14`, Node 14, Chrome 92, `a.vIUFYd`…) returned 0 ratings in
   16,086/16,086 calls once Google switched these queries to AI Overviews. Parse
   machine-readable blobs (JSON-LD, `#media-scorecard-json`, GraphQL) — and a
   page missing its blob is `parse_error`, never a silent null. Fixture tests in
   `lambda/test/` pin each parser; refresh the fixture from a live page when a
   site changes, don't loosen assertions.
3. **A failed scrape must not mark the title fresh.** v1 stamped
   `ratingsScrapedAt` on every attempt (even both Lambdas failing) → no retry for
   1–90 days. Now: invoke failure → `scrapedAt: null` → retried next visit; the
   empty payload carries NO ratings (the upsert treats "has ratings" as
   "attempted"). Gate-skip and completed scrapes DO stamp.
4. **Scraper-sourced ids/links are merge-only.** `upsertExternalIds` used to
   fully reconcile and DELETE stored RT/LB/MC slugs on any refresh that didn't
   return them. Now only TMDB-owned ids reconcile deletes. Watch links: a
   country is replaced ONLY when JustWatch answered for it
   (`watchLinkCountries`); otherwise existing links are untouched.
5. **Verify from AWS IPs, not your laptop.** Sites block datacenter ranges
   selectively. Test new code in a throwaway function (`movie-enrich-canary`
   pattern: same execution role, `create-function`, then delete) before
   repointing prod.

## Cost gate

`scrapeSkipReason`: adult → skip; popularity < `SCRAPE_MIN_POPULARITY` (env,
default 1) → skip; stamped as attempted so crawlers don't re-trigger it every
visit. Measured yield by popularity (Oct 2026, 48-title sample, anything useful
returned): <1 → 17%, 1–3 → 42%, 3–10 → 75%, ≥10 → 92%. Before the gate, 32% of
scraped movies were adult and 61% had popularity < 1 (crawler-driven). Admin
force-refresh bypasses the gate.

## Deploying the Lambda

```
cd lambda && npm install && npm test          # builds + parser tests
node package-lambda.js                          # dist/ + package.json only
aws lambda publish-version --function-name movie-ratings-scraper-beta   # rollback point FIRST
aws lambda update-function-code --function-name movie-ratings-scraper-beta --architectures arm64 --zip-file fileb://lambda-deployment.zip
```
Rollback: `update-function-code` from a published version's code, or restore
the Chromium-era config (layer `chromium133:1`, 1024MB, x86_64) + version 1.
TF (`terraform/lambda.tf`) mirrors the config but the artifact is deployed
out-of-band (`ignore_changes`) — do not `terraform apply` to ship code.
The response contract is duplicated in `lambda/lib/types.ts` and
`sources/lambda.ts` (`EnrichResponseV2`) — change both. A legacy
`{queryStringParameters}` shim in `lambda/index.ts` answers the pre-v2 app;
delete it once `enrich.legacy_call` stops appearing in the logs.

## Deep links on the read side

`cached-queries.ts` exposes `googleData.watchLinksByCountry` (all countries);
`getWatchOptionsForCountry` overlays deep links onto TMDB's provider list for
that country by provider name (`mergeDeepLinks`: exact key, then prefix —
"Apple TV" ↔ "Apple TV Store"), so TMDB logos are kept and providers without a
local icon (Hulu, Disney+, Max…) still get deep links. `/api/watch-providers`
serves links for any country (was IN-only).

## Terms

IMDb datasets: personal & non-commercial use. JustWatch GraphQL, RT,
Metacritic, Letterboxd: unofficial/scraped — keep request volume low (one call
per title per freshness window, gated), identify via UA where asked (Wikidata).

See also: `.claude/rules/postgres-hydration.md` (freshness thresholds,
background refresh cap), `.claude/rules/analytics-system.md` (`api_calls`),
`.claude/rules/infrastructure.md` (IAM, PM2 jobs).
