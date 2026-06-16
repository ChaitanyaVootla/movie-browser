# Social Signals — Consolidation & Promotion (North-Star Design)

**Date:** 2026-06-16
**Branch:** `feat/social-phase0`
**Status:** Design approved (visual direction validated in the design lab). North-star
for a multi-phase program; each phase gets its own spec + plan.
**Design lab:** `/design/social` (`src/app/design/social/**`) — a throwaway, data-less
playground that renders the finalized treatments on real CDN posters with an accent
switcher. Keep it until Phases A–C ship; delete after.

---

## 1. Problem

Phase 0/1 shipped a full social/community stack (tracking, ratings, reviews,
discussion, lists, follows, notifications — see `.claude/rules/social-features.md`),
but the surfacing is **scattered and under-promoted**:

- On the **detail page**, discussion appears twice (a prominent teaser strip high up,
  full threads near the bottom) while **reviews are buried below the galleries** and
  the **ratings histogram** is even lower. The three community surfaces are far apart
  and unequal in prominence.
- On **cards everywhere else** (home carousels, search, profile, related), the only
  personal signals are a watched/watchlist corner badge + grayscale. There is **no
  series progress, no "your rating", no social proof** — so the social layer is
  invisible the moment a user leaves a detail page.
- There is **no friend-activity surface** and **no year-in-review** — the two
  highest-leverage retention/virality loops in this product category.

Goal: a **single, theme-led signal language** that promotes these features
consistently across every surface a title appears, and consolidates the detail page
into a coherent community zone — without breaking the edge-cache / spoiler-gate /
natural-key invariants.

## 2. Research basis (what we're stealing, adapted)

From a competitive synthesis (Letterboxd, Trakt, Serializd/TV Time, IMDb, Goodreads,
Spotify, Strava, Reddit/YouTube). The high-leverage patterns, **adapted to our
constraints**:

1. **One recognizable per-state vocabulary, identical everywhere** — but **theme-led,
   not a multi-hue palette** (our deviation from Letterboxd's green/orange/blue; see
   §3). States differ by **glyph + shape + fill**, riding a single dulled accent.
2. **"You" vs "community" must never look the same** (IMDb gold-vs-blue) — done in one
   accent: your rating = filled accent star; community = neutral.
3. **Series progress = a small ring / hairline bar + `x/y`** — never a big ring that
   covers art (our constraint). No incumbent uses rings on cards; all use bars.
4. **Reviews ranked by likes + a rating distribution histogram**, friends-first when a
   graph exists.
5. **Discussion/comment counts as social proof** on cards/carousels.
6. **Friend activity feed** (Strava/Spotify/Letterboxd) — the daily-return engine.
7. **Year-in-review shareable cards, gated behind a minimum-activity threshold**
   (Wrapped/Letterboxd YIR) — the biggest organic-growth loop.
8. Caveats we honor: **locale-aware counts** (lakhs, not just K/M); **don't kill the
   detailed/filterable progress view** for an up-next-only model (Trakt's 2025
   backlash).

## 2b. Accent decision — Scarlet (locked 2026-06-16)

The brand accent moves from the current bright red to **Scarlet** — a deeper,
more cinematic red chosen in the design lab after a contrast/psychology/brand
comparison (crimson vs scarlet vs Netflix red vs gold/teal alternates).

- **Dark mode** (`.dark` `--brand`): `oklch(0.59 0.235 22)` — rgb `234 36 52`.
- **Light mode** (`:root` `--brand`): `oklch(0.52 0.215 22)` — rgb ~`200 30 46`
  (darker for contrast on the light/cream canvas; **verify ≥4.5:1 on `cream`
  when applied**).
- **`--brand-foreground`**: white (`oklch(0.99 0 0)`) in both modes — scarlet is
  deep enough that white text/icons on a scarlet fill clear AA.
- **Why scarlet:** clears WCAG AA (~5:1) for small text on pure-black OLED;
  hue ~22 reads energetic/cinematic without being the literal Netflix red
  (`#E50914`, hue ~27) — distinct enough to avoid a clone read.
- **`--sig`** (the dulled personal-signal tone) derives from `--brand` via
  `color-mix(in oklab, var(--brand) ~78%, grey)`, so it re-tints automatically.
- **CAVEAT — destructive-red collision:** the accent is now a red, which clashes
  with error/destructive semantics. Destructive actions (delete, block, report,
  remove) must use a **distinct** red or rely on iconography/labels — do NOT let
  `--brand` double as the danger colour. Audit destructive UI when the accent
  lands.

**Applying it** is a small `globals.css` change (`--brand` + `--brand-rgb` +
`--brand-foreground` for `:root` and `.dark`), independent of the phasing — done
as the first step of Phase A (or a standalone commit). The architecture is
accent-agnostic, so this does not affect any phase design.

## 3. Design language — the laws every phase obeys

1. **One state vocabulary, everywhere, theme-led.** Personal state rides a single
   **dulled accent tone** (`--sig` = `color-mix(in oklab, var(--brand) ~78%, grey)`),
   plus neutral/white-over-imagery. **No multi-hue palette.** States are told apart by
   **glyph + shape + fill**, not by colour. (Decision: rejected the four-colour
   Letterboxd palette — it fights a cinematic, single-accent brand and clutters cards.)
2. **Small corners + a hairline bar only on posters.** No HUD strips, no large rings
   over the art — they hurt at-a-glance title recognition. Personal signals occupy the
   **existing bottom-left scoop slot**; progress is a **bottom hairline bar**.
3. **"You" vs "community" never look the same.** Your rating = **%-filled accent star**
   (partial fill = the value) + optional accent heart. Community average = **neutral**.
4. **Viewer-gated, global-fallback.** Every social-proof signal shows friend-scoped
   data when the viewer has a graph, and falls back to global/public counts otherwise.
   No empty states.
5. **Edge-cache invariants are sacred** (`social-features.md` §HARD INVARIANTS). No
   `auth()`/`headers()` in any ISR render tree (`/u`, movie, series, discuss). Global
   counts are cacheable; **viewer/personal state (your rating, progress, "friends
   here") hydrates client-side** via server actions / the user store — never baked into
   cacheable HTML. This is why personal card signals reuse the existing client-hydrated
   `UserStatusBadge` pattern, and why "friends here" sits in a client island.
6. **Cheap signals only at card/carousel scale.** Surface denormalized/already-cheap
   counts (`comment.likeCount/replyCount`, single-row `series_progress`). Add a
   denormalized counter only when a signal must render at carousel scale (see §6). Add
   a `getSeriesProgressBatch` so progress bars never N+1.
7. **Thresholds kill negative social proof.** Don't render "1 review" or "2 watching".
   Mirror the existing discussion-badge ≥5 rule per signal.
8. **Locale-aware counts** (`Intl.NumberFormat` compact), never hardcoded `K`/`M`.
9. **DESIGN.md is law** — mobile-first 390px, 40px touch targets, safe-area,
   over-imagery-white the only hardcoded-colour exception. The vocabulary is codified
   in DESIGN.md before any component changes.

## 4. Finalized surface designs

### 4.1 Poster card (`MovieCard`) — maps 1:1 onto today's slots

| Slot | Today | Finalized |
|------|-------|-----------|
| Top-right | Community `vote_average` chip | **Unchanged** |
| Bottom-left (inverted-corner scoop) | 1 media/quality badge (Trending/New…) | **Personal cluster** — `%-star + heart` / watched tick / bookmark — **supersedes** the quality badge when the viewer has state; falls back to the real quality badge otherwise |
| Bottom-right (scoop) | User-status badge (watched/watchlist) | **Removed** — folds into the bottom-left cluster (kills the BL/BR split) |
| Bottom edge | — | **Hairline progress bar** (in-progress series); the bottom-left chip lifts 3px so it never overlaps/notches the bar |
| Whole poster | grayscale when watched | **Unchanged** (watched is conveyed by grayscale; the chip carries rating/heart) |
| Below card | Title + year (+ optional discussion count ≥5) | **Unchanged** |

Hover still reveals the existing quick-action strip; the up-next label (`S2E6 · Up
next`) reveals on hover above the bar.

### 4.2 Wide card — footer-line pattern

For continue-watching / recents / recommended / circles scrollers. Backdrop carries a
**footer line of social proof** (`💬 discussing · 👥 friends`) on the image — **no
in-card title** (title moves below the card like every other card) — plus the same
hairline progress bar. Subline below = `Up next · S?E?` or year.

### 4.3 Detail page — consolidated community zone

Vertical flow (the realistic, intuitive order; replaces today's scattered layout):

1. **Hero** — faithful to today: backdrop is `h-full w-auto`, **right-aligned, never
   cropped** (the existing `MediaBackdrop` desktop logic), content in the
   width-constrained left column (`hero-content-width = clamp(280px,30vw,480px)`), real
   height clamp (`clamp(400px,60vh,750px)` desktop). Overlay = logo → AI hook → **real
   `RatingsBar`** (icon images: IMDb/RT/RT-audience/Google) → watch-options pill
   (provider logos).
2. **Action bar** (real `MediaActionBar`, below the hero): Trailer · Watchlist ·
   Watched/Progress · Like 👍 · Dislike 👎 · Share · Rate · Diary.
3. **Community teaser row — two peer boxes** (the consolidation):
   - **Discussion** (the existing prominent `CommentPeek`, KEPT): cycling top-comment
     teaser + `💬 N comments · Join the discussion →` + cycle dots.
   - **Reviews & Ratings** (NEW peer, same visual language): **header = the rating
     distribution** (avg shown once + mini histogram + your `★`), **body = the top
     review cycling**, **footer = counts** (`N ratings · N reviews · Read & rate →`).
   - **Rationale (Reviews ≡ Ratings, one axis):** `user_ratings` is the canonical
     rating; a review propagates its rating into it, but most ratings have **no**
     review. So ratings = the quantitative signal (histogram, all raters), reviews =
     the written subset. They are merged into one box; discussion is a separate box
     (conversation is a different axis). Avg is shown once (header), counts in the
     footer — never repeated.
   Each box is the **at-a-glance entry** into its tab in the full band below — not a
   duplicate. This elevates reviews+ratings to discussion's prominence (the original
   ask) and keeps discussion as prominent as today.
4. **Full Community band** — tabbed Discussion / Reviews & Ratings (the existing
   `DiscussionSection` + `ReviewsSection`, relocated together here, replacing the
   buried-below-galleries placement).
5. Overview / galleries / similar continue below.

## 5. The program (phases A–F)

Dependency order: **A → (B, C in parallel) → D → E**; **F** can slot in anytime after A.
Each phase is its own spec + plan; this doc is the umbrella.

| Phase | Scope | New data/infra | Depends on |
|-------|-------|----------------|------------|
| **A — Signal vocabulary on cards** | DESIGN.md tokens for the state vocabulary (`--sig`, glyphs, `%-star`, hairline bar); implement on `MovieCard`/`WideMovieCard`/`MediaCard`; "you vs community"; thresholds; locale-aware count util | `getSeriesProgressBatch(userId, seriesIds[])`; client-hydration path for batch progress + your-rating (extend user store / a server action) | — (foundation) |
| **B — Detail-page consolidation** | The §4.3 flow: relocate Reviews & Ratings up beside Discussion as the two teaser boxes; the full tabbed Community band; keep `CommentPeek` | per-title published review count (cheap COUNT, consider partial index); reuse `getRatingHistogram`, `getPublishedCommentCount` | A (shares glyphs/bar) |
| **C — Hero & carousel social proof** | Discussion/review counts + progress + "popular with friends / this week" ordering in the hero carousel + trending cards | denormalized per-title comment/review count if needed at carousel scale; friend-scoped ordering query | A |
| **D — Friend-activity feed** | New home surface (+ optional desktop right rail); one-tap-to-act rows; push reviews/logs into followers' feeds on save; global "active now" fallback for graph-less viewers | activity feed read model (fan-out-on-read over follows + `watch_events`/reviews/comments); cursor pagination | A, viewer-gating from §3.4 |
| **E — Retention loops** | Year-in-review shareable story cards (activity-gated ≥N logged), yearly watch goal, taste-compatibility %, episode-drop push polish | recap aggregation over `user_stats`/`watch_events`; shareable OG image generation | D |
| **F — Discussion ranking math** | Hot = log-score × time-decay; comment ranking = Wilson interval — applied to hub + detail band | ranking expressions over existing denormalized `likeCount`/`lastActivityAt` | A |

**Social-graph stance (cross-cutting):** design every surface **viewer-gated with
global fallback** (friend-scoped when the viewer has a graph; global/public otherwise),
so D/E light up as the graph grows without empty states today.

## 6. Data & infra notes (cheap vs expensive)

- **Cheap (denormalized / single-row):** `comment.likeCount`, `comment.replyCount`,
  `user_reviews.likeCount`, `series_progress` for one (user, series), `user_ratings`
  for one (user, title), `getRatingHistogram` (wrapped try/catch), follow counts.
- **Needs building:**
  - `getSeriesProgressBatch(userId, seriesIds[]): Map<seriesId, SeriesProgress>` — one
    query for many cards (Phase A). Without it, progress bars N+1.
  - Per-title **published review count** and **comment count** — currently a COUNT;
    fine for a detail page, but at **carousel scale** (Phase C) consider a denormalized
    counter (`movies/series.publishedReviewCount`, `…commentCount`) updated on
    write, or a batched aggregate. `log()` any top-N/sampling cap — never silently
    truncate.
  - Friend-scoped "active on this title / popular with friends" — new aggregate;
    viewer-specific so **never cached** (client island).
- **Edge-cache split (per §3.5):** global counts → cacheable RSC; your-rating /
  progress / "friends here" / follow state → client-hydrated islands. The detail
  teaser boxes render global data server-side; personal overlays hydrate.

## 7. Open questions / deferred

- **Light-mode action bar:** the real `MediaActionBar` uses white-over-imagery button
  styles but sits below the hero on the page background; verify it in the `cream`
  light theme during Phase B (may need theme-token variants).
- **Hover-strip vs persistent chip interplay** on poster cards (both occupy the bottom)
  — resolve precisely in Phase A implementation (fade the persistent chip on hover, or
  keep both).
- **Card display-mode (poster vs wide):** Phase A must cover both `MovieCard` and
  `WideMovieCard` since `MediaCard` switches by preference.
- **Whether the customizable accent stays** (product is reconsidering): the vocabulary
  is accent-agnostic (`--sig` derives from `--brand`), so either way is fine.
- **`getSeriesProgressBatch` cache/hydration shape** — server action + user-store cache
  vs. on-demand; decided in Phase A.

## 8. Non-goals (this program)

- No changes to the underlying social data model / schema beyond the additive
  denormalized counters and the batch read in §6.
- No new AI on render/crawler paths (cost-safety invariant).
- Profile widget dashboard, circles/clubs (Phase 2+) are out of scope here.

---

See also: `.claude/rules/social-features.md` (the stack + hard invariants),
`.claude/rules/design-system.md` (DESIGN.md law), `.claude/rules/performance.md`
(ISR/edge-cache, card prefetch), `.claude/rules/cdn.md` (single-path invalidation for
privacy flips). Design lab: `src/app/design/social/**`.
