# Local Review Kit — Social Features (Phase 0 + Phase 1)

A click-through walkthrough for reviewing the social features locally on
branch `feat/social-phase0`. You run the app against the **local dev DB** (a
docker Postgres on port **5436**), seed it with demo data, log in, and tour
every feature.

> **CRITICAL — never touch prod.** The `.env` `DATABASE_URL` tunnels to the
> production database. Everything below pins `DATABASE_URL` to
> `postgresql://dev:dev@localhost:5436/moviebrowser` on the command line. The
> seed script itself refuses to run unless the URL contains `5436`. **Always
> set `DATABASE_URL` inline** for the seed, typecheck, AND `yarn dev` — do not
> rely on `.env`.

---

## 0. Ensure the dev DB is up (Postgres + pgvector on :5436)

The dev DB is a `pgvector/pgvector:pg17` container named
`movie-browser-dev-pg`, mapping container `5432` → host `5436`.

Check if it is already running:

```bash
docker ps --filter "name=movie-browser-dev-pg"
```

If it is running and already seeded from a previous session, skip to the click
tour. To **(re)create it from scratch**:

```bash
# Drop any old container, start a fresh one
docker rm -f movie-browser-dev-pg 2>/dev/null
docker run -d --name movie-browser-dev-pg \
  -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=moviebrowser \
  -p 5436:5432 \
  pgvector/pgvector:pg17

# Wait a few seconds for it to accept connections
until docker exec movie-browser-dev-pg pg_isready -U dev -d moviebrowser; do sleep 1; done

# Extensions (vector for embeddings columns, pg_trgm for fuzzy search indexes)
docker exec movie-browser-dev-pg psql -U dev -d moviebrowser \
  -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Push the Prisma schema (creates all tables incl. the social models)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push

# Apply the raw-SQL UGC integrity constraints (CHECKs, partial uniques,
# UNIQUE NULLS NOT DISTINCT) that Prisma cannot express
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  npx tsx scripts/apply-ugc-constraints.ts

# Seed the `countries` reference table (full ISO 3166-1 alpha-2 list).
# REQUIRED: it is the FK target for watch_options.country_code. Hydration only
# lazily upserts a title's origin/production countries, but watch-provider rows
# reference arbitrary TMDB regions — so without this, miss-path hydration of an
# uncatalogued title aborts on watch_options_country_code_fkey and the row never
# persists. (seed-social-demo.ts also seeds this automatically as step 0/4.)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  npx tsx scripts/seed-countries.ts
```

You should see `apply-ugc-constraints.ts` report the `chk_*` CHECK constraints
(16) and the `uq_*` unique indexes (3) present, and `seed-countries.ts` report
249 ISO codes upserted.

---

## 1. Seed the demo data

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  npx tsx scripts/seed-social-demo.ts
```

This is **idempotent** — re-run it any time; demo users are upserted by
`googleId` and all their social rows are wiped + recreated each run.

**Catalog path.** The seed needs catalog rows so posters/backdrops resolve.

- If `TMDB_API_KEY` is set in your environment, it hydrates the 8 titles
  through the real hydration service (full TMDB upsert — credits, images,
  episodes, the lot). It logs `catalog path: hydration`.
- Otherwise it inserts **minimal catalog rows directly** (title, overview,
  poster/backdrop paths, a couple of seasons + episodes for each series), using
  stable TMDB image paths so images still load via the CDN. It logs
  `catalog path: fallback`. This is the default and works fully offline.

To force the richer hydration path:

```bash
TMDB_API_KEY='<your-tmdb-v3-key>' \
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  npx tsx scripts/seed-social-demo.ts
```

At the end it prints the demo users, their `/u/<username>` URLs, the key movie
/ series / discuss URLs, and row counts.

**Seeded titles:** Fight Club (550), Inception (27205), The Dark Knight (155),
Forrest Gump (13), The Matrix (603); Breaking Bad (1396), Game of Thrones
(1399), Stranger Things (66732).

**Seeded demo users:**

| Username        | Name          | Notable data |
|-----------------|---------------|--------------|
| `cinephile_ada` | Ada Lumière   | 5 film watches (incl. a Matrix rewatch), 4 ratings, a published non-spoiler review, Four Favorites + a pinned regular list, follows bea, followed by bea + cy |
| `binge_bea`     | Bea Watanabe  | Breaking Bad S1 + into S2 (WATCHING, watermark S2E3), GoT COMPLETED (series-level), comments on a movie + an episode, filed a report |
| `critic_cy`     | Cy Roberts    | 2 film watches, a published **spoiler** review (Dark Knight), an ENDING-scope comment, follows ada |

---

## 2. Run the app (pointed at the dev DB)

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
  USER_DATA_SOURCE=postgres \
  ENABLE_MONGODB_ENRICHMENT=false \
  yarn dev
```

> The single most important step: **dev MUST point at :5436**, not the
> prod-tunnel `.env` DB. If you run a bare `yarn dev`, you will be looking at
> production data and none of the demo seed.
>
> **`USER_DATA_SOURCE=postgres` is required** — without it, every social feature
> throws `Social features require USER_DATA_SOURCE=postgres` (a guard in
> `requirePgUserId`; prod sets it, local `.env` may not). `ENABLE_MONGODB_ENRICHMENT=false`
> keeps the app off any Mongo path.

Open http://localhost:3000 (or whatever port Next prints).

---

## 3. Click-through tour

Each feature maps to a concrete seeded URL. Most surfaces render
**anonymously** (public profiles, published non-spoiler comments, reviews) —
you only need to log in to *post* something or to see *progress-gated* content
as a specific user.

### Home — "Up Next"
- `/` — the home shelves. After you log in (step below) and as your own watch
  progress accrues, the **Up Next / Continue** shelf surfaces series you are
  mid-watch. Bea's seeded `series_progress` (Breaking Bad WATCHING) is what
  drives this for that account.

### Public profile (`/u/cinephile_ada`)
- `/u/cinephile_ada` — the flagship public profile. Verify:
  - **Backdrop** (Inception) behind the hero, **violet accent**, bio,
    **location** (Paris, FR), and the two profile **links**.
  - **Stats** (films watched, hours, followers/following) — computed live from
    the seeded `watch_events` via the `user_stats` snapshot.
  - **Four Favorites** row (Matrix, Fight Club, Inception, Breaking Bad).
  - **Pinned list** "Comfort Rewatches".
  - **Reviews** module (her published Fight Club review).
  - Also try `/u/binge_bea` (currently-watching shelf shows Breaking Bad
    S2E3) and `/u/critic_cy`.

### Movie page — review + discussion (`/movie/550/fight-club`)
- Scroll to the **Reviews** section — Ada's non-spoiler review.
- Scroll to the **Discussion** section — Bea's root comment + Ada's reply
  (both NONE-scope, so they render even when logged out / in ISR HTML).
- The **AI summary** button is here too (see Caveats — it is click-gated and
  cached, costs $0 locally).

### Series page — progress tracking (`/series/1396/breaking-bad`)
- The action bar reflects **watch progress** once you are logged in as a user
  with progress (Bea). The seeded watermark is S2E3.
- The season/episode selector lets you jump into the per-episode discuss page.

### Episode discuss page — spoiler-gated comments (`/series/1396/breaking-bad/discuss/s2e1`)
- Two seeded comments on this episode:
  - An **EPISODE-scope** comment (Bea) — gated to people who have watched S2E1.
  - An **ENDING-scope** comment (Cy) — gated to people who have finished the
    series.
- **Logged out**, the spoiler-scoped comments are hidden behind the gate; the
  page is still indexable (only NONE-scope content is in the anon/ISR tier).
- **Logged in as Bea** (watermark S2E3) you clear the EPISODE gate; the ENDING
  comment stays gated unless your watermark covers the finale.
- Note the **AI thread summary** card and the **DiscussionForumPosting**
  JSON-LD in page source.

### Diary (`/diary`)
- Your logged watches, newest first — includes the Matrix **rewatch** row
  (flagged) and Bea's episode-level entries.

### Stats (`/stats`)
- Hours, top genres, decades, streaks, rewatches — computed from your
  `watch_events`. (Logged-in `/stats` may compute live; public profiles use the
  cached snapshot.)

### Settings (`/settings`)
- **Profile** tab: claim/change username, edit bio, backdrop, accent, links,
  location, and set your Four Favorites.
- **Blocked users** tab: see and manage blocks/mutes (see below).
- **Import** tab: Letterboxd / Trakt / IMDb import UI (Phase 1 import parsers).

### Notifications (`/notifications`)
- Seeded: a **FOLLOW** notification (Cy followed Ada) and a **REPLY**
  notification (Ada replied to Bea). Log in as Ada or Bea to see theirs.

### Admin — moderation (`/admin`)
- Open the **Moderation** tab. The seeded **OPEN report** (Bea reported Cy's
  ENDING-scope comment as a spoiler) appears in the queue; you can transition
  the comment's status (publish / flag / remove).
- Admin routes require an `ADMIN` role. To make yourself admin after logging in
  (replace the email with your Google email):
  ```bash
  docker exec movie-browser-dev-pg psql -U dev -d moviebrowser \
    -c "UPDATE users SET role='ADMIN' WHERE email='you@example.com';"
  ```

---

## Logging in to post (and the AI gate)

The demo users are seeded **without** OAuth accounts — they exist so their
public content renders, but you cannot *log in as them*. To post a comment or
review yourself:

1. Log in with **your own Google account** (Auth.js Google OAuth). This creates
   a real `users` row for you on first login.
2. Claim a username in `/settings` (required before some social actions).
3. Post a comment/review on any title.

**AI moderation gate.** New reviews/comments pass through an AI safety gate
**on submit** (the first AI-gate consumer). Locally with no AI provider
configured the gate is effectively dormant/permissive (see Caveats) — your post
goes through; in production it classifies the text before publishing.

## Block & mute

- **Block** = mutual invisibility (neither user sees the other's content
  anywhere). **Mute** = one-way hide (you stop seeing them; they are unaffected).
- Manage both from **Settings → Blocked users**, or from a user's profile /
  a comment's overflow menu. Every social read path filters through the blocks
  helpers, so blocking a demo user immediately removes their seeded comments and
  reviews from your view.

---

## Caveats

- **AI features are cost-safe and dormant-ish locally.** The review/comment AI
  gate fires only **on submit**; the AI title summary is **click-gated and
  cached** (generated once on demand, then read from PG). With no Bedrock /
  OpenRouter credentials configured locally these paths are no-ops /
  permissive, so reviewing the UI costs **$0**. Nothing AI-related runs until
  you explicitly trigger it, and nothing bills until deployed with real
  provider credentials.
- **Web push is a no-op.** `VAPID` keys are unset locally, so push
  subscriptions and push notifications silently do nothing. In-app
  `/notifications` still works (it reads the `notifications` table).
- **Screenshots were deferred.** This walkthrough is text-only; no reference
  screenshots are bundled.
- **`cache-l1` full-suite flake is pre-existing.** If you run the full unit
  suite, a `cache-l1` test may flake intermittently. This is unrelated to the
  social features and predates this branch.
- **Fallback catalog is minimal.** Without `TMDB_API_KEY` the catalog rows have
  just the fields needed for the social surfaces (title, images, a couple of
  seasons/episodes). Cast galleries, full episode lists, ratings, and watch
  providers will be sparse — set `TMDB_API_KEY` and re-seed for the full
  hydration path if you want rich detail pages.
