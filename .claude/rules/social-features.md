# Social & Community Features (Phase 0 + Phase 1)

The master reference for the tracking-core / profiles / discussion / moderation
stack built on branch `feat/social-phase0` (NOT yet deployed to prod). Phase 0 =
Tracking Core + public profiles; Phase 1 = Discussion layer. Phases 2–4 are
planned-not-built. Source of truth for intent:
`docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md`;
resume board: `docs/superpowers/plans/PROGRESS.md`.

**Scope (paths this rule governs):**
`src/server/actions/{tracking,profile,reviews,reviews-helpers,review-reactions,catalog-search,comments,comment-reads,social,user-ratings,imports,diary,lists,notifications,reports,thread-summary}.ts`,
`src/server/db/postgres/social/**`, `src/server/db/postgres/comments.ts`,
`src/server/services/{discussion,moderation,import,notifications}/**`,
`src/server/db/audit.ts`,
`src/components/features/{tracking,profile,settings,reviews,discussion,rich-text,notifications,stats,home}/**`,
`src/app/u/**`, `src/app/{diary,stats,settings,notifications}/**`,
`src/app/series/[...params]/discuss-page.tsx`, `src/lib/user-id.ts`,
`src/lib/{watch-dates,tracking-format,profile-accents}.ts`,
`postgres/init/04-ugc-constraints.sql`, the social models in
`prisma/schema.prisma`. See also `.claude/rules/audit-log.md` and the profile
widget-dashboard spec `docs/superpowers/specs/2026-06-13-profile-widget-dashboard-design.md`.

---

## Architecture (what ships, by feature area)

- **Tracking core** — the diary + watermark model. `watch_events` (one row per
  watch occurrence; rewatch = new row), `series_progress` (materialized one row
  per (user, series): current-cycle pointer for Up Next + lifetime
  high-watermark `max*` for the spoiler gate), `user_ratings` extended in place
  (`score Int? 1–10` + thumb `rating Int?` ±1 + `ratedAt`). `watched_movies`
  was hard-migrated into `watch_events (source=BACKFILL)` and dropped.
  DB layer: `social/{watch-events,progress,progress-derive,ratings,stats,stats-compute,stats-dirty}.ts`.
  Actions: `tracking.ts`, `diary.ts`, `user-ratings.ts`.
  **Diary/log unification (2026-06-14, `docs/superpowers/specs/2026-06-14-diary-log-unification-design.md`):**
  `watch_events` gained snapshot/analytics columns (`media_type`, `runtime_minutes`,
  `release_year`, `cycle`, `score`) written on EVERY create path (decouples
  "hours watched" from catalog churn → ClickHouse-ready) AND a `kind`
  (`WATCH`|`NOTE`): a diary entry need NOT be a viewing — `NOTE` logs a
  rating/note only and is EXCLUDED from every "watched" inference (progress,
  hours, spoiler gate, hide-watched, taste, public heatmap). **Any new
  `watch_events` read that means "watched" MUST filter `kind = 'WATCH'`.**
  `user_ratings` + `user_reviews` are generalized to ANY granularity
  (movie/series/season/episode; reviews also per-`watchEventId` for per-rewatch
  reviews) via partial `UNIQUE NULLS NOT DISTINCT` indexes (movie rating keeps a
  Prisma compound unique). Canonical rating = `user_ratings`; per-viewing rating
  = `watch_events.score` (logging a score also upserts canonical, Letterboxd-style).
  UI: segmented `WatchedButton` (movie), shared `diary-panel.tsx` (Sheet/Drawer
  per-title log), redesigned `/diary`, richer Set-Position modal.
- **Public profiles `/u/[username]`** — identity page: TMDB-art backdrop through
  the hero/gradient system, accent (3-tier OKLch theming), bio/links/location
  (all in `users.metadata` Json envelope — no schema change), Four Favorites,
  pinned lists, public reviews, stats, follow button + counts. DB:
  `social/public-profile.ts`, `social/follows.ts`. Actions: `profile.ts`,
  `social.ts`. Page: `src/app/u/[username]/page.tsx`.
  **METADATA KEY GOTCHA (Jun-19-2026 prod crash):** the user-entered free-text
  display location is `metadata.profile.displayLocation` (string). Do NOT use
  `metadata.profile.location` — that key holds the **geo object**
  `{countryCode,city,...}` written at sign-in by `lib/auth.ts`/`lib/user-location.ts`
  and read by the admin Users tab. They collided once (profile wrote a string there,
  geo overwrote it with an object) → `location.trim is not a function` crashed every
  profile with a stored location. `ProfileEnvelope.location` is typed as the geo
  object so `.trim()` on it is a compile error; profile reads coerce
  `displayLocation` defensively (non-string → ""/null).
- **Profile = customizable WIDGET DASHBOARD** (branch work, in flux — full design
  in `docs/superpowers/specs/2026-06-13-profile-widget-dashboard-design.md`).
  The body below the hero is a grid of registered widgets (stat tiles, ratings/
  genres/decades charts, country flag-breakdown, **Watch activity** GitHub-style
  heatmap + recent titles, Four-Favorites poster board, currently-watching, lists,
  reviews). Registry + layout schema in `components/features/profile/widgets/`
  (`types,registry,render,widget-card,country-map,watch-activity`); layout saved
  in `users.metadata.profile.layout` (JSON, no migration). **Dual render**:
  PUBLIC = static SSR CSS grid (`profile-dashboard.tsx`, `.dash-grid` in
  globals.css) — cacheable/SEO; OWNER edit = `react-grid-layout` v2
  (`profile-dashboard-editor.tsx`, owner-only, `dynamic ssr:false`) swapped in by
  `profile-dashboard-switch.tsx` via `editMode` in `profile-viewer-context.tsx`;
  Save → `updateProfileLayoutAction`. **Settings = on-profile MODAL**
  (`profile-settings-dialog.tsx`, hero "Settings" button) holding appearance +
  account/privacy/blocked/data (the `/settings` page still exists as the
  username-claim bootstrap + nav fallback). GOTCHAS (each burned time):
  (a) `react-grid-layout` v2.2.3 is a React-19 hook-API rewrite — NO
  `WidthProvider`; use `useContainerWidth` + `dragConfig`/`resizeConfig` +
  `verticalCompactor` (v1 breaks on React 19 — removed `findDOMNode`).
  (b) Profile avatar (`avatarImagePath`) + backdrop (`imagePath`) are TMDB FILE
  PATHS — must prefix `TMDB_IMAGE_BASE/wNNN` before use as an `src` (the hero
  backdrop passes `exactSrc` to `HeroBackdropShell` to bypass its CDN-by-id);
  forgetting the prefix on `public-profile.ts` rendered a broken relative URL →
  initials.
  (c) The backdrop picker searches **TMDB** (`searchTitlesForBackdrop`) +
  `getTitleImages` falls back to TMDB — the local `images`/catalog tables are
  sparse in dev (~11 titles), so local-only search/images looked broken.
  (d) Country stats key by **ISO code** (`topCountries: {code,count}`); the
  widget derives flag emoji + name (`country-list`, with a SHORT_NAMES map for
  verbose official names).
- **Reviews** — `user_reviews`, a distinct entity (NOT a comment variant), one
  per user per title (per season for series). FIRST AI-gate consumer (default
  `status=PENDING_REVIEW`). **Redesigned 2026-06-15
  (`docs/superpowers/specs/2026-06-15-reviews-rich-composer-design.md`) to the
  discussion polish bar:** reviewing + rating are ONE act, two records — the
  composer carries a half-star control (0.5–5 → canonical `user_ratings.score`
  1–10, `score=round(stars*2)`) + a "loved it" heart (`user_ratings.liked`, new;
  thumb retired from the review flow) + an optional `title` + a RICH body built
  on the **shared `components/features/rich-text/` editor** (emoji, @mentions,
  `[[entity]]`, inline `[spoiler]`, ≤4 catalog images via `images Json?`).
  `upsertReview` upserts the review row AND the canonical rating in ONE
  `auditedTransaction`. Reviews ADOPTED the comment **`spoilerScope`** model
  (enum + `scopeSeason`/`scopeEpisode`/`scopeTmdbEpisodeId`) — the bare
  `containsSpoilers` boolean is GONE. Anon tier = `spoilerScope=NONE` only (hard
  filter in `getPublicReviews`); spoiler-tier reviews load via the `loadReviews`
  server action (POST) gated by `visibleReviewScopeWhere` + the viewer watermark
  (reuses `spoiler-gate.ts`). **Likes**: polymorphic `Reaction.reviewId` (+ the
  pre-existing `commentId`) + denormalized `user_reviews.likeCount`;
  `toggleReviewLike` mirrors `toggleLike`; like→batched notify via the
  generalized `notifyLikeBatched` (`targetType: "comment"|"review"`). Display:
  ratings histogram (`getRatingHistogram` over `user_ratings`, NULL scores
  abstain; rendered as a compact Letterboxd-style track-backed bar chart beside
  the tabs — `rating-histogram.tsx`) + Popular/Recent/Following tabs + season
  selector (series). Pure helpers (`starsToScore`, `resolveReviewScope`) live in
  `reviews-helpers.ts` (NOT the `"use server"` `reviews.ts`). DB:
  `social/reviews.ts` + `social/ratings.ts` (`liked`, histogram). Actions:
  `reviews.ts`, `reviews-helpers.ts`, `review-reactions.ts`. Components:
  `features/reviews/*`.
  - **RATING-WRITE invariants (got these wrong first pass — final review caught
    them):** (a) `setUserRating`'s delete/keep/create decision MUST factor
    `liked` — a heart-only row (no thumb, no score) is valid and must persist;
    clearing a score while keeping the heart must NOT delete the row (treat
    "empty" as `thumb===null && score===null && liked!==true`). (b) `upsertReview`
    propagates the rating (`setUserRating(score ?? null, liked ?? false)`) when
    `hadExistingReview || score!=null || liked` — the `hadExistingReview` guard
    is load-bearing: an unconditional always-propagate WIPES the rating of a
    quick-rater who then writes a text-only review (the composer can't prefill a
    rating that has no review row). Editing a review DOES clear a removed
    score/heart. (c) The ISR-cached public profile read (`getUserReviews` from
    `public-profile.ts`) MUST pass `noneScopeOnly:true` — it is NOT the same as
    `getPublicReviews`; without it, whole-review-spoiler bodies leak into
    cacheable HTML (invariant 2 break). (d) `getReviewHistogram` is wrapped in
    try/catch → empty histogram on error (it's called in a cached RSC render;
    an unguarded throw takes the page down).
- **Shared rich-text editor (`src/components/features/rich-text/`)** — the
  generic Tiptap editor + read-only renderer, **extracted from the discussion
  feature 2026-06-15** so discussion AND reviews share ONE editor: `serialize.ts`
  (token round-trip incl. inline-spoiler), `extensions.tsx`
  (`buildMentionExtension(anchor: MediaAnchor)`, emoji, `SpoilerMark`),
  `use-rich-text-editor.ts`, `emoji-picker.tsx`, `mention-chip.tsx`,
  `mention-suggestion-list.tsx`, `emoji-suggestion-list.tsx`,
  `entity-image-picker.tsx`, `toolbar.tsx` (`RichTextToolbar`), `rich-text-body.tsx`
  (`RichTextBody({ body, entityMentions?, status?, idKey? })` — NOT coupled to
  `CommentDto`). Catalog mention/image search is the generic
  `server/actions/catalog-search.ts` (`searchMentionEntities`, `getEntityImages`).
  The anchor type is `MediaAnchor` (alias of the old `DiscussionAnchor`). Reviews
  pass no resolved `entityMentions` yet → `[[entity]]` tokens fall back to label
  (chip-thumbnail parity for reviews is a documented fast-follow).
- **Discussion** (Phase 1) — `comments` (threaded, spoiler-scoped, circle-aware
  anchor; replies denormalize anchor columns from root). Per-episode SEO pages
  via `discuss-page.tsx` (renders `DiscussionForumPosting` JSON-LD). Dedicated
  per-title pages via `discussions-page.tsx` (movie + series `/{id}/{slug}/discussions`).
  DB: `postgres/comments.ts`. Actions: `comments.ts` (write) + `comment-reads.ts`
  (read). Services: `discussion/{spoiler-gate,comment-schemas,mentions,rate-limit,thread-summary}.ts`.
  - **ROUTING GOTCHA (burned a debug cycle 2026-06-15, twice over):** movie/series
    detail routes are CATCH-ALLs (`src/app/{movie,series}/[...params]`). You CANNOT
    add a static child route folder like `[...params]/discussions/page.tsx` — Next.js
    forbids a static segment after a catch-all (`Invalid segment … catch all segment
    must be the last segment`) → **fatal Turbopack panic, whole app down** (and it is
    invisible to typecheck + unit tests; only a real `next` build/dev catches it). Add
    new sub-pages by folding them into the catch-all `page.tsx`: a sibling
    `*-page.tsx` component + a pure parse helper that detects the trailing segment,
    branched in both `generateMetadata` and the default export — exactly like
    `discuss-page.tsx`/`discussions-page.tsx`. AND: the proxy slug-canonicalizer
    (`src/server/proxy/media-resolver.ts`) 308s any unknown `/{id}/...` tail to the
    bare detail slug, **stripping your new suffix** — so the page is unreachable until
    you add the suffix to the preserved set (`DISCUSS_RE`/`DISCUSSIONS_RE` parsed
    before `MEDIA_DETAIL_RE`, re-appended in `decideMediaRoute`). Always verify a new
    detail sub-route by actually loading it in the running dev server, not just tests.
  - **CSP GOTCHA (Phase C, 2026-06-15):** Phase C (link/trailer cards) introduced the
    app's **FIRST global `Content-Security-Policy`** (`next.config.mjs` `headers()`,
    `/:path*` — APP-WIDE, see also `.claude/rules/cdn.md`). A host-restricted `img-src`
    SILENTLY breaks images across the whole app, not just discussion pages. `img-src`
    MUST include every external image host the app loads: TMDB CDN
    (`image.tmdb.org`/`image.themoviebrowser.com`), `flagcdn.com` (country flags in
    nav + detail badges), `*.googleusercontent.com`/`*.ggpht.com` (Google avatars),
    `img.youtube.com`/`i.ytimg.com` (yt thumbs), `www.google.com` (card favicons).
    `frame-src` = `youtube-nocookie.com` + `youtube.com` (existing trailer embeds +
    lite-youtube facade). `script-src`/`style-src` MUST keep `'unsafe-inline'
    'unsafe-eval'` (App Router needs them — a nonce-only CSP breaks the app). The CSP
    is built dev-aware: dev appends `ws://localhost:* http://localhost:*` to
    `connect-src` for Turbopack HMR. **Before changing the CSP, audit every external
    resource the app references and browser-verify the console for zero CSP violations
    (the bug class is invisible to unit tests + typecheck).**
- **Notifications + web push** — `notifications` (write-on-event only, bounded
  by direct recipients — NO fan-out), `push_subscriptions`. DB:
  `social/notifications.ts`. Action: `notifications.ts`. Push service:
  `services/notifications/push.ts` (VAPID-gated; unset keys = silent no-op).
- **Blocks / mute** — `blocks` (BLOCK = mutual invisibility + follow-sever;
  MUTE = one-way hide). Enforced query-helper pattern in `social/blocks.ts`
  (`getHiddenUserIds`, `assertNotBlocked`) — every social read path filters
  through it; never hand-roll block where-clauses.
- **Moderation** — AI submit gate (`services/moderation/comment-gate.ts` +
  `gate.ts`/`gate-policy.ts`), `reports` table + admin queue. DB:
  `social/reports.ts`. Action: `reports.ts`.
- **Lists / Four Favorites** — `lists` + `list_items` (gapped-integer
  `position`; person items supported). Four Favorites = `List(kind: FOUR_FAVORITES)`
  (no separate favorites table). DB: `social/lists.ts`. Action: `lists.ts`.
- **CSV import / export** — `import_jobs`. Parsers (Letterboxd / Trakt / IMDb)
  in `services/import/{csv,letterboxd,trakt,imdb}.ts`; resolution + runner in
  `resolve.ts`/`runner.ts`; raw upload retained as lossless fallback. Action:
  `imports.ts`.
- **Audit backbone** — generic trigger-based `audit_log` over an opt-in set of
  low-churn tables. Detailed in **`.claude/rules/audit-log.md`** — read it before
  touching `postgres/init/05-audit.sql` or `src/server/db/audit.ts`.
- **Phase D — Destination & Retention (branch `feat/discussions-flesh`, Jun 2026).**
  `EPISODE_DROP` + `LIKES_BATCH` NotificationType values; cross-catalog `/discussions`
  hub (ISR, Hot/New anon + Following viewer-scoped); `notifyEpisodeDrop` (idempotent,
  bounded, dropKey-gated) + `notifyLikeBatched` (pure coalescing, never one-per-like);
  `cue` system user (`users.metadata.bot=true`) + daily Cue trending-seed cron (one
  Bedrock Flex call per virgin title, `auditedTransaction(cueUserId, …)` for audit
  attribution, `shouldSkipTitle` idempotency); `CueBadge` on Cue-authored comments;
  inert audience-selector stub in composer + hub (circles-readiness seam, NOT WIRED).
  PM2 crons: `episode-drop-notify` (05:00 UTC) + `cue-seed` (20:00 UTC) — both carry
  the `CRON_HOUR_UTC` guard + `nice -n 19`.
- **Signal surfacing & consolidation (2026-06-16, spec
  `docs/superpowers/specs/2026-06-16-social-signals-consolidation-design.md`).**
  A theme-led, single-accent (**Scarlet**) signal vocabulary promoting tracking/
  ratings/reviews/discussion across surfaces — NO multi-hue palette (see DESIGN.md
  → Social signals; `--sig` = dulled brand for personal glyphs). **Phase A**
  (shipped): the `/api/user/library` hydration carries `score`/`liked`/
  `seriesProgress` (additive) → user-store selectors `selectScore`/`selectLiked`/
  `selectSeriesProgress`; `components/features/media/social-signals.tsx`
  (`PartialStar`, `CardProgressBar`, `PersonalCornerCluster`) renders on
  `MovieCard`/`WideMovieCard`/`WideCard` — a bottom-left **personal cluster**
  (½-star = `score/2` + heart / watched / watchlist) that SUPERSEDES the quality
  badge, plus a bottom hairline progress bar. **Phase B** (shipped): detail-page
  **Community teaser row** — `DiscussionEntryStrip` + `features/reviews/
  reviews-ratings-entry.tsx` (`ReviewsRatingsEntry`, anon-cacheable histogram +
  `getPublicReviewCount`) as 2-col peers under the action bar, in both
  `{movie,series}/[...params]/page.tsx`; `ReviewsSection#reviews` is the CTA
  target. **Phase C** (partial): `getPublishedCommentCountsForType` (one grouped
  query) → `MovieCarousel.commentCounts` → existing `DiscussionCountBadge` on home
  trending. All new reads are viewer-agnostic / client-hydrated (edge-cache
  invariant intact). Deferred: popular-with-friends ordering, hero-overlay counts,
  destructive-red audit (`--destructive` ≈ Scarlet hue).

---

## THE HARD INVARIANTS — a UI/UX session MUST NOT break these

1. **EDGE-CACHE (spec §4.1.8).** `/u/[username]` (`revalidate=300`), `movie` /
   `series` (`revalidate=3600`), and the per-episode `discuss-page.tsx` are
   **ISR-cached** (each route ALSO exports `generateStaticParams` — required or
   `revalidate` is a no-op). **NO user-specific/viewer data in the cacheable RSC
   HTML.** Viewer state (follow state, owner toolbar, own rating/review, gated
   comments, block menu) hydrates **client-side via server actions**. Do NOT add
   `auth()` / `headers()` anywhere in those render trees (page, layout, and every
   server fn they call) — it silently kills ISR.
2. **SPOILER-GATE.** Discussion comments are gated by the viewer's watch progress
   (`services/discussion/spoiler-gate.ts`). The **anon-cacheable tier** =
   `spoilerScope=NONE` AND `status=PUBLISHED` AND `circleId IS NULL` ONLY
   (`getPublicCommentPage` in `postgres/comments.ts` bakes this in — convention
   is not enough). The gated tier loads via the `loadComments` server action
   (`comment-reads.ts`) — a POST, never edge-cached. **Never render gated bodies
   into cacheable HTML.** The gate reads ONLY the lifetime watermark (`max*`),
   never the current-cycle pointer. The predicate is exported pure
   (`isScopeVisible`) and as a Prisma where (`visibleScopeWhere`) so it is usable
   site-wide (summaries, notification previews, AI chat).
3. **USER DATA USES NATURAL KEYS FOR EPISODES** — `(series_id, season_number,
   episode_number)` + soft `tmdb_episode_id`. **NEVER FK to `episodes`/`seasons`**
   (hydration delete+reinserts them — see `postgres-hydration.md`). FK to the
   stable parent `series` row is fine. `series` is the only catalog parent these
   user tables relate to via FK (always `Restrict` for UGC).
4. **`requirePgUserId` / `USER_DATA_SOURCE=postgres`.** Social features are
   Postgres-only; `requirePgUserId()` (`src/lib/user-id.ts`) throws
   "Social features require USER_DATA_SOURCE=postgres" otherwise. `user-id.ts`
   **self-heals** a missing `users` row from a valid session (idempotent upsert
   by `googleId`), so an authed session always resolves to a PG id.
5. **AUDIT ACTOR ATTRIBUTION.** Mutating actions on audited tables
   (`users, user_reviews, comments, user_ratings, blocks, follows, lists,
   watchlist`) run through `auditedTransaction(userId, fn)` (`src/server/db/audit.ts`)
   so `audit_log.actor_id` is set via `SET LOCAL`. Writes outside the wrapper
   still audit — with a NULL actor. Cross-link **`.claude/rules/audit-log.md`**.
6. **AI COST-SAFETY.** The comment/review AI gate runs ONLY on submit and is
   rate-limited (`discussion/rate-limit.ts`); the thread summary is **click-gated
   + cached** (`thread_summaries`, served only to a viewer whose visible-comment
   set is a superset of the cached input via `scopeKey`). **NEVER** invoke AI on a
   render or crawler path. Gate failure (timeout/parse/LLM error) returns null →
   the comment is stored `PENDING_REVIEW` (fail-CLOSED for publish, fail-open for
   the user — they still get a row).
7. **DESIGN.md is law** for all UI (mobile-first 390px, `@/lib/design`
   primitives, semantic tokens, 40px+ touch targets, safe-area). The ONLY
   hardcoded-color exception is over-imagery white (legible on arbitrary
   backdrops). No edits under `src/components/ui/`.

(Schema invariants behind the above: typed nullable anchor columns, never
generic `(itemId, itemType)`; every FK column indexed regardless of `onDelete`;
no fan-out writes; comments never hard-deleted — deletion = `status DELETED_BY_USER`
+ scrubbed body. Full rationale in the spec §4.1.)

---

## LOCAL DEV recipe

Full click-through in **`docs/LOCAL_REVIEW.md`**. Short form (NEVER touch prod —
the `.env` `DATABASE_URL` tunnels to PROD on :5433):

```bash
# Dev DB: pgvector/pg17 container on :5436 (movie-browser-dev-pg)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx tsx scripts/apply-ugc-constraints.ts
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx tsx scripts/apply-audit.ts
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx tsx scripts/seed-social-demo.ts

# Run the app against the dev DB (USER_DATA_SOURCE is mandatory for social)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  USER_DATA_SOURCE=postgres ENABLE_MONGODB_ENRICHMENT=false yarn dev
```

### Run the dev server under PM2 — self-serve debugging (do this for autonomous work)

Prefer running the local dev server under **PM2** so an agent can start/restart it
and **read its logs to debug without a human relaying errors**. Config:
`ecosystem.dev.config.cjs` (local-only; sets the :5436 DB + `USER_DATA_SOURCE` +
`ENABLE_MONGODB_ENRICHMENT=false` + `ENABLE_TEST_AUTH=true`; PM2 sets these in
`process.env` BEFORE Next loads, and Next does NOT override already-set env, so
this DATABASE_URL wins over the prod-tunneled one in `.env`).

```bash
npx pm2 start ecosystem.dev.config.cjs   # start mb-dev
npx pm2 restart mb-dev                    # RESTART after any schema/prisma generate (stale client = "Unknown argument")
npx pm2 logs mb-dev --nostream --lines 80 # read runtime errors yourself (grep for "error"/"Prisma"/"Unknown argument")
npx pm2 stop mb-dev / delete mb-dev
```

- **After `prisma generate` / `db push`, ALWAYS `pm2 restart mb-dev`** — a running
  dev server holds the OLD generated client and rejects new columns as "Unknown
  argument" (cost a debug cycle 2026-06-14).
- Local has **no ClickHouse** → `clickhouse_insert_error: fetch failed` in the log
  is expected and harmless.
- `src/proxy.ts` **429s `curl`/headless** (bot-shed) — a 429 from a script is the
  shed, not a render bug; a real browser is unaffected. To curl past it, spoof a
  full Chrome UA + `sec-ch-ua` client hints (see `.claude/rules/performance.md`).
- **General principle:** when you need to work fast, efficiently, and
  autonomously, set up this kind of self-serve tooling (process manager + log
  access + a seeded local DB + test-auth) up front so you can observe real
  behavior and iterate without waiting on a human to paste errors back.

### Two local-dev perf footguns (diagnosed 2026-06-14 — pages hung 40-90s)

Both are ENVIRONMENT issues, not app/feature bugs (hydration logs "PostgreSQL
fully fresh" while the page still hangs). Symptoms: movie/series/profile pages
take 20-90s, the single-threaded dev server saturates ("nothing loads"), logs
show `fetch_retry … "This operation was aborted"`.

1. **Broken undici response decompression** — `TypeError:
   controller[kState].transformAlgorithm is not a function` in this local Node
   (20 & 22) + Next 16 Turbopack runtime. Decompressing gzip/br responses
   crashes, so EVERY compressed outbound `fetch` hangs until its 20s abort +
   retries (TMDB API, the proxy slug-resolver's existence check in
   `media-resolver.ts`, geo, OAuth userinfo, YouTube). On one thread they
   serialize → total saturation. **Fix (shipped): `src/instrumentation.ts`
   patches global `fetch` to send `Accept-Encoding: identity` in dev only
   (Node runtime), bypassing decompression.** NEVER in prod (real undici works,
   keeps gzip). Took movie pages 86s → 0.15s. AWS-SDK calls (Bedrock/Cohere)
   don't use global fetch, so a lone residual log line from background
   enrichment is harmless.
2. **No local ClickHouse** while `.env` `CLICKHOUSE_HOST` points at prod → every
   page-view/event insert (incl. the `/api/analytics/ingest` route) awaits a
   multi-second connect-timeout; under rapid interaction these pile up and
   saturate the dev thread (made set-position/"mark up to here" feel like a
   ~1min hang). **Fix (code-level, robust): `getConfig()` in
   `src/lib/analytics/client.ts` returns null in non-prod unless
   `ENABLE_DEV_ANALYTICS=true`** — analytics is OFF by default in dev regardless
   of env. (An `ecosystem.dev.config.cjs` `CLICKHOUSE_HOST=""` override is NOT
   reliable — `pm2 restart --update-env` doesn't always re-apply the ecosystem
   env block; the code guard is the dependable fix. To re-apply ecosystem env
   cleanly: `pm2 delete mb-dev && pm2 start ecosystem.dev.config.cjs`.)
4. **Synchronous miss-path hydration calls AWS Lambda.** A title NOT in the
   sparse dev catalog is a true PG miss → SYNCHRONOUS hydration (TMDB + upsert +
   the Google/ratings **Lambdas**). Locally those Lambdas are slow/absent, so the
   upsert transaction blows its 30s timeout (`Transaction already closed … do
   less work`) and, on one dev thread, saturates everything (auth/session,
   compile all climb to 30s+). `MAX_BACKGROUND_REFRESH=0` does NOT cover this —
   the miss path is synchronous, not background. **Fix (code-level):
   `DEV_LAMBDA_DISABLED` in `sources/lambda.ts` makes `callGoogleLambda`/
   `callRatingsLambda` return null in non-prod (set `ENABLE_DEV_LAMBDA=true` to
   opt in)** → a miss is TMDB-only (~2-3s cold, ~0.3s warm). Prod untouched.
3. **Background refresh + enrichment + SSE pile-up on the sparse dev catalog.**
   Every detail-page visit triggers a background TMDB refresh → progressive
   enrichment (Bedrock/Cohere) that never settles locally, AND opens a 120s SSE
   poll (`/api/[mediaType]/[id]/enrich`). These STACK per navigation and
   saturate the single dev thread — symptom is PROGRESSIVE degradation where
   even Turbopack compile creeps from ~1s to 45s and unrelated pages stop
   loading. `ecosystem.dev.config.cjs` sets **`MAX_BACKGROUND_REFRESH=0`**
   (hydration/index.ts) to disable the refresh/enrichment chain in dev. Verified
   flat ~0.1s loads across repeated navigation after this + the undici patch.
5. **`countries` FK target unseeded → hydration upsert rolls back → titles never
   persist (diagnosed 2026-06-15).** `watch_options.country_code` FKs to
   `countries(code)`; hydration's `upsertWatchProviders` inserts TMDB
   watch-provider region codes assuming `countries` is fully populated. A fresh
   dev DB only had ~7 codes → `watch_options_country_code_fkey` violation aborts
   the ENTIRE upsert transaction → the movie/series row is never written → every
   visit stays a PG miss and the slug resolver leans on its 2s TMDB existence
   check (intermittent `/discussions` 404s; `[Hydration/Postgres] Error upserting`
   log spam). **Fix: seed `countries` — `scripts/seed-countries.ts` (idempotent,
   :5436-guarded, country-list pkg + XK/TW/SU), wired as step 0 of
   `seed-social-demo.ts`.** Prod is fine (seeded by `prisma/seed.ts`
   `yarn db:seed --ref`) but that seed is NOT in the deploy pipeline — a latent
   gap for any fresh env that skips it.
6. **`MAX_BACKGROUND_REFRESH=0` also no-ops the miss-path PERSIST (not just
   refresh).** A true PG miss returns TMDB data but persists via
   `backgroundRefreshMovie/Series`, which the dev `=0` guard skips — so browsing
   a title in dev rendered it but NEVER added it to the local catalog (compounds
   footgun 5's 404s). **Fix (`hydration/index.ts` `persistOnMissInDev`): when
   `MAX_BACKGROUND_REFRESH===0 && NODE_ENV!=="production"`, the miss path fires a
   TMDB-only (NO enrichment/Lambda/SSE — those are the pile-up) fire-and-forget
   upsert, so dev visits populate PG.** Prod (cap>0) + tests (cap defaults to 3)
   are inert. Now any browsed title persists → resolver PG-hits → 404s gone.

- `seed-social-demo.ts` is idempotent and **refuses to run unless `DATABASE_URL`
  contains `5436`**. It seeds 3 demo users (`cinephile_ada`, `binge_bea`,
  `critic_cy`) with progress/reviews/comments/reports. Demo users have NO OAuth
  account (you cannot log in *as* them — their public content just renders).
- **test-auth (LOCAL-ONLY, triple-gated).** To get a session without Google
  OAuth: set `ENABLE_TEST_AUTH=true` (non-prod only) and POST/GET
  `/api/test-auth/login` (one call, no CSRF dance). It is registered ONLY when
  `TEST_AUTH_ENABLED` = `NODE_ENV !== "production"` AND `ENABLE_TEST_AUTH === "true"`
  (`src/lib/auth.config.ts`), which **hard-crashes boot if the flag is seen in
  production**; the route 404s when the gate is off. NEVER set `ENABLE_TEST_AUTH`
  in any prod/deploy config.

---

## FILE MAP (by feature area)

| Area | Server action(s) | DB / service layer | Components |
|------|------------------|--------------------|------------|
| Watch tracking | `tracking.ts`, `diary.ts` | `social/{watch-events,progress,progress-derive}.ts` | `features/tracking/*` |
| Ratings | `user-ratings.ts` | `social/ratings.ts` | (in media action bar) |
| Stats | (page) | `social/{stats,stats-compute,stats-dirty}.ts` | `features/stats/*` |
| Profiles | `profile.ts`, `social.ts` | `social/{public-profile,follows}.ts` | `features/profile/*`, `features/settings/*` |
| Profile dashboard | `profile.ts` (`updateProfileLayoutAction`, `searchTitlesForBackdrop`, `getTitleImages`) | `social/public-profile.ts` (dailyActivity/recentWatches/topCountries) | `features/profile/{profile-dashboard,profile-dashboard-switch,profile-dashboard-editor,profile-settings-dialog,profile-viewer-context}.tsx`, `features/profile/widgets/*` |
| Reviews | `reviews.ts`, `reviews-helpers.ts`, `review-reactions.ts` | `social/reviews.ts` (incl. `getVisibleReviews`), `social/ratings.ts` (`liked`, `getRatingHistogram`) | `features/reviews/*` (composer, card, like button, histogram, section, client, own-slot, star-rating-input) |
| Shared rich-text | `catalog-search.ts` (`searchMentionEntities`, `getEntityImages`) | `services/discussion/spoiler-gate.ts` (`visibleReviewScopeWhere`), `services/discussion/comment-schemas.ts` (`MediaAnchor`) | `features/rich-text/*` (editor, toolbar, emoji, mentions, image picker, `RichTextBody`) — shared by discussion + reviews |
| Discussion | `comments.ts`, `comment-reads.ts`, `thread-summary.ts` | `postgres/comments.ts`, `services/discussion/*` | `features/discussion/*` |
| Discussion hub | `discussions-hub.ts` (getHubPublicPage, getHubFollowing) | `social/discussion-hub.ts` (Hot/New/Following DB reads) | `app/discussions/page.tsx` + `hub-tabs.tsx` + `hub-thread-card.tsx` |
| Moderation | `reports.ts` | `social/reports.ts`, `services/moderation/*` | `features/discussion/{report-dialog,user-moderation-menu}.tsx`, admin moderation tab |
| Blocks/mute | `social.ts` | `social/blocks.ts` | `features/settings/blocked-users-settings.tsx` |
| Notifications | `notifications.ts` | `social/notifications.ts`, `services/notifications/push.ts` | `features/notifications/*` |
| Notifications Phase D | (cron: `seed-episode-drop-notifications.ts`) | `services/notifications/notify.ts` (notifyEpisodeDrop, episodeDropPayloadKey), `services/notifications/likes-batch.ts` (notifyLikeBatched, mergeLikesPayload) | `features/notifications/describe.ts` |
| Cue AI seeds | (cron: `seed-cue-comments.ts`) | `services/cue/{cue-prompt,cue-seed}.ts` (CUE_USERNAME/CUE_METADATA, shouldSkipTitle, insertCueSeed via auditedTransaction) | `features/discussion/cue-badge.tsx` (AI badge on Cue comments) |
| Lists / Four Favorites | `lists.ts` | `social/lists.ts` | `features/settings/four-favorites-editor.tsx`, `features/profile/four-favorites.tsx` |
| Import / export | `imports.ts` | `services/import/*` | `features/settings/{import-client,export-data-button}.tsx` |
| Up Next (home) | (uses `social/progress.ts`) | — | `features/home/up-next-section.tsx` |
| Audit | (`auditedTransaction` wrapper) | `src/server/db/audit.ts` | — |

Routes: `/u/[username]`, `/diary`, `/stats`, `/settings` (+ `/settings/import`),
`/notifications`, `series/[...params]/discuss-page.tsx`.

---

## PRE-DEPLOY CHECKLIST (must happen before this branch reaches prod)

0. **Social schema migration — SHIPPED to prod Jun 19 2026 (after 3 tries; read this
   before any future schema-shape change).** The first social deploy is a real,
   un-rehearsable-from-synthetic-data migration. What broke and the fixes (all now in
   `deploy-ec2.yml` + schema + `postgres/migrations/2026-06-19-watched-movies-to-watch-events.sql`):
   - **`watched_movies` → `watch_events` (table DROP):** expand/contract. `[2.5a]`
     snapshots `public.watched_movies` → `migration_backup.watched_movies` (a SEPARATE
     PG schema `db push` does NOT manage — verified the copy survives the push) and sets
     `--accept-data-loss` ONLY for that deploy; db push drops the now-backed-up table +
     creates `watch_events`; `[2.5b]` runs the idempotent backfill (verifies completeness,
     hard-fails with the snapshot retained). The backfill MUST set `media_type='MOVIE'`
     (NOT NULL no-default, added 2026-06-14; `watched_movies` was movies-only).
   - **`prisma db push` REFUSES a required (NOT NULL, no-default) column on a POPULATED
     table — and aborts ATOMICALLY (applies NOTHING).** This sank deploy #1: `user_ratings`
     gained required `media_type` and had 177 prod rows → db push aborted → social tables
     never created → the new code 500'd on every render ("table public.comments does not
     exist"). **Fix: `@default` on such columns** (`user_ratings.mediaType @default(MOVIE)`).
     **Before ANY social-shape deploy, run `prisma db push --accept-data-loss` against a
     RESTORED PROD DUMP (or at least dump-shaped data) and read the "changes that cannot
     be executed" list** — synthetic/empty tables hide exactly this (my rehearsal had an
     empty `user_ratings`). Verified pre→post the ONLY data-loss op was the `watched_movies`
     drop; the only NOT-NULL-on-populated blocker was `user_ratings.media_type`.
   - **`cmd | tail` masks exit codes** — it silently defeated the `[2.5b]` hard-fail guard
     (deploy reported ✅ on a failed migration). Capture `$?` via a temp file; never gate
     on a piped command. Same bug hid lint/`test:ci` failures.
   - **`next build` (not just typecheck+lint) first runs in the DEPLOY job**, so build
     errors surface only at deploy. The `/discussions` hub prerendered against Prisma with
     no build-time DB → build abort; fixed by fail-open (try/catch → empty hub, like
     `getReviewHistogram`). Build locally with a bogus `DATABASE_URL` before pushing.
   - Take a fresh verified PG snapshot to S3 first (`~/bin/pg-backup.sh`; pin a copy
     outside the 30-day `backups/` prefix). See memory `social-rollout-prep-jun19`.
   - **AFTERMATH:** the migration succeeded but the deploy's cold cache + the day's CPU-
     credit burn left the `t4g` THROTTLED and prod degraded — see `performance.md`
     "CPU-CREDIT THROTTLE". The box needs `unlimited` credits / an `m7g` move.
1. **Raw-SQL integrity is hash-gated in CI** — confirmed present in
   `.github/workflows/deploy-ec2.yml`:
   - UGC step: applies `postgres/init/04-ugc-constraints.sql` when
     `md5(04-ugc-constraints.sql + schema.prisma)` ≠ `.last-ugc-hash` (16 CHECKs
     + 3 unique indexes incl. `UNIQUE NULLS NOT DISTINCT` + `lower(username)`).
   - Audit step `[3.6/5]`: applies `postgres/init/05-audit.sql` when
     `md5(05-audit.sql + schema.prisma)` ≠ `.last-audit-hash`.
   - Both combine the schema hash because a `db push` table recreation silently
     DROPS CHECKs/triggers — the gate must re-fire on a schema change even when
     the SQL file is unchanged. Verify these steps still run after any pipeline edit.
2. **AI kill-switch consideration.** The comment/review gate calls Bedrock Flex
   on submit; the thread summary calls it on click. Both fail-safe (gate→null→
   PENDING_REVIEW; summary→error result) and are rate/click-gated, but confirm
   the cost-tracking + any intended disable path before opening writes at scale.
   Nothing AI fires on render/crawler paths.
3. **VAPID keys for web push.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
   (+ optional `VAPID_SUBJECT`). Unset = push is a silent no-op
   (`services/notifications/push.ts`); in-app `/notifications` still works. Set
   them only when push is intended to go live.
4. **CloudFront single-path invalidations — NOT yet wired (open follow-up).**
   Profile privacy flips / username changes / moderation removals SHOULD trigger
   a **single-path** invalidation (`/u/<username>*` or the one discuss page) —
   NEVER `/*` (cold-purges the whole edge; see `cdn.md`). Today `profile.ts`
   carries only a `DEPLOY FOLLOW-UP` comment marking the hook site; wire it
   before relying on instant privacy/removal propagation (otherwise edge HTML
   can serve stale up to the route's s-maxage).
5. **`ENABLE_TEST_AUTH` must NEVER be set in prod** — the boot-time fail-closed
   assert in `auth.config.ts` will crash the app if it is. Verify it is absent
   from every deploy/prod env.
6. **`USER_DATA_SOURCE=postgres`** must be live on the target (already true on
   beta) or every social action throws.

See also: `.claude/rules/audit-log.md`, `.claude/rules/postgres-hydration.md`
(why catalog tables churn → natural-key invariant), `.claude/rules/cdn.md`
(edge-cache + single-path invalidation), `.claude/rules/server-actions.md`,
`.claude/rules/design-system.md`, `.claude/rules/type-safety.md`.
