# Plan — card + hover preview overhaul

Spec: `docs/superpowers/specs/2026-10-09-card-hover-preview-overhaul-design.md`
Branch: `feat/card-preview-overhaul`. One owner, executed inline. Commit after each task.

Baseline (base f79204ee, recorded before any change):
- `yarn typecheck` passes. `yarn lint` reports 0 errors and 115 warnings.
- `vitest run`: 23 failures in 3 files, all pre-existing (`lib/analytics/client.test.ts`,
  `discussion/comment-peek.test.tsx`, `discussion/discussion-page-header.test.tsx`).
- Entry JS gz: home 249.0KB, browse 267.6KB, movie 310.3KB, series 325.7KB, person 248.4KB,
  privacy 240.2KB.

## T1 — Geometry (TDD)
1. Write `hover-card/geometry.test.ts` (width scaling, centering, L/R clamp, flip up,
   short viewport, navbar minTop, narrow viewport). Run it and confirm it fails.
2. Implement `hover-card/geometry.ts` `computePreviewPlacement`. Run it and confirm it
   passes. Commit.

## T2 — Library writes + shared watched toggle (TDD)
1. Refactor `hooks/use-user-library.ts` to per-item selectors. Toggles return
   `Promise<boolean>`.
2. Add `media/title-actions/use-watched-toggle.ts` (eager|lazy count, confirm state,
   emitDiaryUpdated, ai-post-watch, analytics after success) and
   `watched-confirm-dialog.tsx`.
3. Rewrite `tracking/watched-button.tsx` on top of the hook (hero visual unchanged).
   Give WatchedButton a `compact` variant and add `series-progress-pill.tsx`.
4. SaveButton: the toggle returns boolean, analytics fire only on success, add a 40px
   `compact` size, fix the comment, and wire `usePreviewHold` for the picker.
5. RateButton: `variant="compact"` and `reviewHref`, plus `usePreviewHold`.
   QuickLogButton: `variant="compact"`, NotebookPen glyph, and `usePreviewHold`.
6. `title-actions.tsx`. MediaActions (detail) consumes it (hero).
7. `title-actions.test.tsx`: confirm >1, no confirm at 1, failure → toast and no
   track, series matrix. Commit.

## T3 — Preview store + data hook
- `hover-card/preview-store.ts` (zustand: target, openedBy, holds, grace timer,
  `usePreviewHold`). `hover-card/use-preview-data.ts` (status machine, 8s timeout,
  retry). The old `hover-card-context.tsx` is deleted.

## T4 — Shared preview content
- `preview-parts.tsx` (meta, ratings, providers with trackWatchClick, cast, skeleton,
  fallback) and `preview-body.tsx` (variant popover|drawer; the art Link and the
  stagger).

## T5 — Overlay + triggers
- `hover-card-overlay.tsx`: portal, measured placement (ResizeObserver), morph
  (clip-path + ghost), reduced motion, dismissal (scroll outside, resize, route, Esc,
  leave/grace, press-drag), holds, a11y, focus management.
- `hover-card-wrapper.tsx`: pointer-type-gated intent, click suppression, keyboard
  peek and ArrowDown, long-press for touch pointers at any width.
- `mobile-quick-info-drawer.tsx`: a slim shell over `PreviewBody`.
- Delete `hover-card/index.ts`. Providers import files directly.
- `hover-card-overlay.test.tsx`: error fallback + retry, mount-once counts, no
  interactive element inside an anchor. Commit.

## T6 — Cards
- `movie/card-core.tsx` (`useCardPersonalState` with useShallow, `CardOverlays`, inset
  focus ring). Thin `movie-card.tsx` / `wide-movie-card.tsx`, both memo'd. Remove the
  hover scale. Delete `movie-card-actions.tsx` and `stop-portal-clicks.*` if unused.
- `MediaCard` passes the displayed image src into the wrapper (for the ghost).
- `media-card.test.tsx`: display-only (no buttons), plus the wrapper triggers. Commit.

## T7 — Cleanup
- Delete UserStatusBadge, PersonCard*, RecommendationsSection (after a grep) and their
  barrel exports. Point WideCard at `@/lib/image`. Commit.

## T8 — Verify
- typecheck, lint, unit, compared against the baseline.
- Dev server under PM2 `mb-cards` on :3011, then the Playwright screenshot matrix (1440,
  1024, 390) and the Back-dismiss pointer-events check.
- `next build` (dummy env) and the bundle measurement.

## T9 — Docs
- DESIGN.md gets a "Hover preview & title actions" section. Update the Social signals
  wide-card line, the pwa-mobile/perf rules where they are now wrong, and the
  design-system rule table row. Commit.

## Status — DONE (2026-10-09)

**Tests and checks**
- Unit tests: 1058 passed. The 23 failures are the same pre-existing ones as baseline, in
  the same 3 files. 44 new tests: geometry 15, TitleActions 11, overlay 7, cards 7, plus
  the existing press-drag suite still passing.
- tsc is clean. eslint: 0 errors, 115 warnings, same as baseline.

**Browser (dev on :3012, because :3011 was taken by another local app)**
- At 1440 and 1024, in poster and wide modes: left/right clamps, bottom flip,
  scroll-inside, list picker held open and stacked above, click suppression, keyboard
  peek + ArrowDown focus + Esc focus return, and the error fallback.
- Short viewport 1024x560: the preview pins and scrolls internally; a page scroll
  closes it.
- Mobile 390: long-press opens the drawer. After Back, `body` pointer-events are `auto`,
  there is no view-transition snapshot, and real touch scroll works. Tap navigates.
- The morph was verified by pausing WAAPI at 0/90/170ms.

**Bundle (entry JS, gzip)**

| Route | Before | After |
|---|---|---|
| home | 249.0KB | 195.4KB |
| browse | 267.6KB | 208.5KB |
| movie | 310.3KB | 309.9KB |
| series | 325.7KB | 325.2KB |
| person | 248.4KB | 247.1KB |
| privacy | 240.2KB | 165.2KB |

**Not verifiable locally (no TMDB key in the worktree)**
- The home carousel, /browse grid and person filmography render 0 cards locally.
- The preview was exercised on the library grids, which use the same `MediaCard`.
- Watch-provider links render only when the PG hover path returns them.
