# Social Actions Consolidation — detail-page Save/Seen clusters

**Date:** 2026-06-20
**Branch:** `feat/social-actions-consolidation` (off `next`)
**Status:** approved design, implementing

## Problem

The movie/series detail action bar grew into ~8 independent controls (Trailer ·
Watchlist split · Watched/Progress · Rate 1–10 stars · Like thumb · Dislike thumb
· Diary · Share) plus a separate Review section with its **own** star rating +
"loved it" heart. Two root incoherences:

1. **Three overlapping sentiment signals**, all live & independent in
   `user_ratings`: `score` (1–10 stars), `rating` (±1 thumb), `liked` (heart) —
   answering one question ("how did you feel?") via three controls in two places.
   The shipped DESIGN.md card vocabulary only defines star / heart / eye /
   bookmark — thumb isn't even in it.
2. **The watch → rate → review funnel is shattered** across 4 controls (Watched
   button, Rate pill, Diary opener, far-down Review section) when it is one act.
   The data model is already Letterboxd-shaped (`watch_events` diary,
   `score = stars×2`, `liked` heart, per-watch reviews) — the data wants a unified
   log; only the UI fragments it.

## Decisions (all confirmed with the user)

- **Layout = Save vs Seen clusters with progressive disclosure** (not a single
  unified Log sheet, not a single status chip).
- **Signals (R2):** Like/Dislike (thumb) = the primary one-tap *quick reaction*,
  kept per prior product research. Stars = optional *precision*. Heart =
  repurposed from "loved it" → **Favorite** (the "this one's special" pin; still
  writes `user_ratings.liked`) so it stops being a third "I liked it." Removed
  from the review composer.
- **Cascades:** (1) Rate or Like/Dislike → **auto-mark Watched** (you can't rate
  what you haven't seen; the existing watched→remove-from-watchlist then fires).
  (2) Marking Watched → the "How was it?" prompt (progressive funnel). (3) Keep
  all existing cascades (watch+score→canonical rating, review→rating,
  watched→remove watchlist).

## Design

### SAVE cluster (future intent) — unchanged
Watchlist split button (bookmark toggle + caret → `SaveToListSheet` for lists).
Already coherent; left as-is.

### SEEN cluster (engagement) — adaptive

**Before any interaction** — two entry pills:
- Movie: **`👁 Watched`** (primary) + **`✎ Note`** (secondary, lighter).
- Series: **`≣ Set position`** + **`✎ Note`**.
- `Note` opens the diary log as `kind=NOTE` (a thought, not a viewing) — excluded
  from every "watched" inference.

**On marking Watched / Set position** — a slim **"How was it?"** surface appears
once (Popover on desktop, Vaul `Drawer` on mobile, routed through
`useHistoryDismiss`): star row + 👍/👎 + ♥ Favorite + "Write a review". All
optional, dismissible, no blocking modal.

**From then on — state is visible:**
- **Desktop:** controls stay inline → `👁 Watched ✓×N · ★ Rate/★8 · 👍/👎 · ♥ ·
  ✍ Review`.
- **Mobile (390px):** bar stays one row; the watched-state pill shows glyphs
  (`Watched ★8 👍`); tapping it reopens the "How was it?" drawer where
  Rate/Like/Favorite/Review live. State always visible even though controls fold.

All personal glyphs use `--sig` (Scarlet) per DESIGN.md social-signals; community
data stays neutral/`--brand`. Touch targets ≥ 40px. ISR invariant preserved —
all viewer state hydrates client-side (no `auth()`/`headers()` in render trees).

### Cascade implementation
- `setRating` / like / review-rating-propagation: when a score, thumb, or `liked`
  becomes set AND the user has no existing `WATCH` event for the title, create a
  `WATCH` `watch_event` (movie-level or series-level). Idempotent — only fires
  when transitioning to "has rating" and not already watched; never duplicates a
  watch on subsequent rate edits. Reuses the existing watch-event create path so
  the watchlist-removal + progress + stats-dirty cascades come for free.

## Non-goals / YAGNI
- No unified single "Log" mega-sheet (chose progressive clusters instead).
- No new schema/migration — all behavior rides existing columns
  (`watch_events.kind`, `user_ratings.{score,rating,liked}`).
- No change to the Save (watchlist/lists) cluster.
- Four-Favorites *list* is untouched; the Favorite heart writes `liked` (the
  existing semantic), surfaced as "Favorite" rather than "loved it".

## Files (expected touch set)
- `src/components/features/media/media-action-bar.tsx`, `media-actions.tsx`,
  `more-actions.tsx`, `score-rating.tsx`
- `src/components/features/tracking/watched-button.tsx`,
  `series-progress-inline.tsx`, `diary-panel.tsx` (note-entry affordance)
- new "How was it?" surface component under `features/tracking/` or `media/`
- `src/components/features/reviews/review-composer.tsx` (drop heart)
- cascade: `src/server/actions/user-ratings.ts`,
  `src/server/db/postgres/social/ratings.ts`, `reviews.ts`, and watch-event create
- tests for the rate/like→watched cascade

## Verification
typecheck + lint + unit tests; load a movie + series detail page locally and walk
the no-interaction → watched → rate/like/favorite/review flow, plus the rate→
auto-watched cascade. User does final review on the live local page.
