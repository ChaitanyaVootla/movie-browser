# Card + hover preview overhaul — design

Date: 2026-10-09 · Branch: `feat/card-preview-overhaul` (base `next` @ f79204ee)
Status: decided (the owner delegated design calls; decisions below are final unless review objects)

## Problem

1. **Cards do too much.** `MovieCard`/`WideMovieCard` each mount a hover quick-action
   strip (`MovieCardActions`). That strip mounts `useSession`, `useMobile`, a `SaveButton`
   with a popover/drawer shell and a `QuickLogButton` with a dialog/drawer shell, per card.
   It is movie-only, so series cards in the same row look different. It also has a
   **data-loss bug**: its Watched toggle (and the hover card's, and the mobile drawer's)
   unmarks silently, which deletes every diary entry. The detail page asks for
   confirmation first when there is more than one entry.
2. **Raw store writes.** Card, hover and drawer call `useUserStore().toggleWatched` /
   `toggleWatchlist` directly. That means no auth gate, no toast, and an **unhandled
   promise rejection** on failure (the store rethrows after reverting). Hover and drawer
   also subscribe to the whole store (`useUserStore()` with no selector).
3. **The hover card is detached from its card.** It is a fixed 440px box centered on the
   card using an *estimated* 520px height. It flips/clamps against that guess, closes on
   any capture-phase scroll (including scrolling inside itself), never renders the
   overview it already fetches, shows an infinite skeleton when a fetch fails, nests
   buttons inside one big `<Link>` (invalid DOM), closes when the pointer moves into a
   popover it opened, keeps opening after a click, and uses `zIndex: 9999`.
4. **Duplication.** `mobile-quick-info-drawer.tsx` re-implements ~250 lines of the hover
   content. The hover overlay is 657 lines (limit 600). Both import the
   `@/components/features/media` barrel, which pulls server-only/heavy modules
   (SimilarSection, admin buttons, enrichment provider…) into every route through the
   root `Providers`.

## Decisions

### D1 — Cards are display-only
- Remove `MovieCardActions` (file deleted). A card renders: poster/backdrop, community
  vote chip (top-right), bottom-left scoop (personal cluster ⟶ else quality badge),
  hairline series progress bar, `CardPendingOverlay`, and grayscale-when-watched.
  This is identical on every surface that uses `MediaCard`: home, browse, person,
  library, similar.
- Shared core: `movie/card-core.tsx` exports `useCardPersonalState(item, opts)` (one
  `useShallow` store subscription for every personal field) and `CardOverlays`
  (vote chip, scoop, progress, pending, focus ring). `MovieCard` and `WideMovieCard`
  become thin layouts on top of it, both `memo`'d.
- Per card, the hooks left are one store subscription, `useMounted` for date-badge
  hydration safety, and image-fallback state. No session, mobile or dialog hooks.
- **Card hover scale is dropped** (`hover:scale-[1.02]` on the card). It was clipped by
  the scroller's `overflow-x:auto` (which forces `overflow-y` to clip too), and the
  preview now grows out of the card, so the scale is redundant. The inner image zoom
  stays because it is clipped inside the poster. The focus ring is drawn **inset**
  on the poster (an absolutely positioned ring overlay), so a scroller can no longer
  clip it.
- **Wide-card footer of social proof** (DESIGN.md "💬 discussing · 👥 friends"):
  **skipped**. There is no friends signal yet, and the discussion count already renders
  below the card via `DiscussionCountBadge`. Wiring both onto the image is not trivial.

### D2 — Hover preview grows out of the card
- **Who gets it:** only real fine pointers (`matchMedia('(hover: hover) and (pointer:
  fine)')` plus `pointerType === "mouse"|"pen"` on the event), and keyboard users. It is
  never width-based.
- **Intent:** a 500ms open delay and a 200ms data warm (kept). A pointer leave starts a
  200ms close grace that is cancelled by entering the preview. A pointerdown or click
  anywhere in the card cancels a pending open and *suppresses* re-opening until the
  pointer leaves the card. A held button (`buttons !== 0`, a row drag) never arms it.
- **Keyboard:** `:focus-visible` on the card link plus a 700ms delay opens a *peek*
  (focus stays on the card, so Tab moves on and closes it). **ArrowDown** on a focused
  card opens immediately and **moves focus into the preview** (first action). **Esc**
  closes it and returns focus to the card. Focus leaving the preview (and not into one of
  its own portalled overlays) closes it. The card link advertises the shortcut with
  `aria-keyshortcuts="ArrowDown"` and `aria-haspopup="dialog"`.
- **Geometry** is a pure function, `computePreviewPlacement()` in
  `hover-card/geometry.ts`, unit-tested:
  - `width = clamp(300, 1.6 × card.width, 400)`, capped at `viewport.width − 2×edge`.
  - Horizontally centered on the card and clamped to `[edge, vw − width − edge]`.
  - Vertically, top-anchored at `card.top − 8` and expanding downward. If the
    **measured** height would overflow the bottom, it flips: the bottom is anchored at
    `card.bottom + 8`. It is then clamped into `[minTop, vh − edge]`, where
    `minTop = 64 (navbar) + 8` at ≥md. If the height still exceeds the available space
    (short viewport), it pins to `minTop`, returns `maxHeight`, and the content scrolls
    internally.
  - It also returns the card rect relative to the preview, which the morph uses.
- **Height** is measured with a `ResizeObserver` in a layout effect before first paint.
  The panel mounts with `visibility:hidden` for that one frame. If the height later
  changes (skeleton → content), placement re-runs.
- **Morph (transform/opacity/clip only; MotionProvider stays on `domAnimation`):**
  - The panel animates `clip-path: inset(<card rect> round 8px)` → `inset(0 round 12px)`
    over 240ms with an ease-out curve.
  - Inside the art region, a **ghost layer** shows the card's *currently displayed image*
    (poster or wide art, already in the HTTP cache). It starts exactly over the card
    rect, then translates and uniformly scales to cover the art region while fading out
    as the backdrop fades in. The artwork therefore never jumps.
  - Body content staggers in (opacity + 4px rise, 40ms steps).
  - `prefers-reduced-motion`: plain 120ms opacity fade, no clip, no ghost, no stagger.
- **Dismissal:**
  - It closes on page scroll, meaning any scroll whose target is not inside the preview
    or one of its held overlays. Scrolling *inside* the preview does not close it.
  - It also closes on resize, route change, Esc, pointer leave (after grace), and a
    press-drag (existing `usePressDragDismiss`).
- **Z-index:** the preview uses `z-50`, the app's single overlay tier (navbar, popovers,
  dialogs, drawers and tooltips are all `z-50` in shadcn). Within a tier, DOM order
  decides: the preview portals into `<body>` when it opens, and any popover or dialog it
  opens portals in *after* it, so those always paint above the preview. A `z-[60]` would
  have hidden the preview's own list picker underneath it (checked against
  `components/ui/*`). The preview never overlaps the navbar (minTop = 72). Surface: `bg-popover text-popover-foreground border border-border
  rounded-xl shadow-lg` (DESIGN.md: shadow-lg = popovers). Over-imagery text in the
  art region uses white (the allowed exception).
- **Content** (shared `PreviewBody`):
  1. Art (backdrop; poster fallback) with title, vote chip and badges, plus the series
     progress hairline (`CardProgressBar`).
  2. Meta line: year, runtime or seasons, two genres.
  3. Overview (`line-clamp-3`).
  4. `TitleActions` (compact).
  5. Ratings row.
  6. Watch providers (logo buttons, `trackWatchClick` with title).
  7. Cast (4 avatars + names, links).
  Personal state is shown through the action fills (Watched check, Listed check,
  Rate pill with %-star + score + heart) and the progress hairline, all from the same
  social-signals primitives as the card.
- **Data states:** `loading` (skeleton of the same shape) → `ready` | `error`. A fetch
  that resolves `null`, rejects, or exceeds 8s becomes `error`. The error state shows
  the title and art from the list item, `TitleActions`, a **Retry** button and a
  **View details** link. There is never an infinite skeleton.
- **Valid DOM:** only the art region (+ title inside it) is a `<Link>`. Actions,
  providers and cast are siblings. There are no interactive elements inside a link.
- **Nested overlays:** the preview store keeps a `holds` counter. Any overlay opened from
  inside the preview calls `usePreviewHold(open)` (SaveToListSheet, RateButton, QuickLog
  dialog, watched-confirm dialog). While `holds > 0`, pointer-leave/blur/scroll do not
  close the preview, so moving into a portalled popover keeps it open. When the last
  hold releases, a close is scheduled unless the pointer is over the preview.
  `usePreviewHold` is a no-op outside a preview (detail page).
- **A11y:** `role="dialog"`, `aria-modal="false"`, `aria-labelledby` pointing at the title.
  Keyboard-open moves focus inside; Esc returns focus to the card.

### D3 — One `TitleActions`
`media/title-actions/`:
- `title-actions.tsx` — `TitleActions({ variant: "compact" | "hero", itemId, mediaType,
  title, posterPath, href, leading?, watchSlot?, engagementSlot?, trailing? })`.
  Order is the detail-page order: **[leading] Watched · Watchlist · Rate · Log
  [trailing]**. The hero variant is consumed by `MediaActions` (detail page), which
  passes Trailer as `leading`, Share as `trailing`, the series position control as
  `watchSlot`, and `SeenCluster` (progressive Rate + Diary panel) as `engagementSlot`.
  The detail page looks the same as before, but is now built from the shared primitives.
- `use-watched-toggle.ts` — the single watched-toggle behaviour:
  - It writes through `useUserLibrary` (auth gate + toasts; it returns `boolean`).
  - **Confirm-before-unmark when diary count > 1.** The hero fetches the count eagerly
    (it shows ×N). Compact fetches it lazily on an unmark click, so a preview open costs
    no server action.
  - After success it calls `emitDiaryUpdated` and dispatches `ai-post-watch` (800ms), and
    fires analytics with the title.
- `watched-confirm-dialog.tsx` — the shared "Remove from watched?" dialog.
- `WatchedButton` (hero) and `CompactWatchedButton` both use the hook. The glyph is Eye
  when idle and Check when active, with the active fill `border-brand/70 bg-brand/40`.
  This unifies DESIGN.md's "eye/check tick" (EyeOff is gone).
- Series: `watchSlot` defaults to `SeriesProgressPill`. It reads `selectSeriesProgress`,
  shows the % or "Track", and links to the detail page, where the position sheet lives
  (the preview has no season data). Watchlist, Rate and Log all support series.
- Watchlist is `SaveButton` (variant `compact` gains the 40px size and caret picker).
  Rate is `RateButton` with a `compact` variant (icon pill) and `reviewHref` (in a
  preview, "Write a review" links to `href#reviews` instead of emitting the on-page
  event). Log is `QuickLogButton` variant `compact`.
- All writes go through `useUserLibrary` or the existing server actions with toasts.
  Analytics fire **after** success, with the title. Zustand is read with selectors only.
  `useUserLibrary` itself is refactored from whole-Set subscriptions to per-item
  selectors.

### D4 — Mobile
- Long-press (500ms, 10px slop) opens the Vaul quick-info drawer on **any touch
  pointer** (pointer events, `pointerType === "touch"`), at any width. Tap still
  navigates, and the click and native context menu that follow a long-press are
  swallowed.
- The drawer renders the same `PreviewBody` (`variant="drawer"`) and `TitleActions`.
  `useHistoryDismiss` wiring and the pathname auto-close are kept. The duplicated
  ~250 lines are deleted.

### D5 — Cleanup
- Split `hover-card-overlay.tsx`. Use direct imports instead of the media barrel. Delete
  the `hover-card/index.ts` barrel (and update providers to direct imports).
- Delete `UserStatusBadge` (move `useIsWatched` into card-core, or drop it if unused),
  `PersonCard`/`PersonCardCompact` (unused), `RecommendationsSection` (only exported,
  never imported), and the unused `setLoading`.
- `WideCard` image bases come from `@/lib/image` (`getWidePosterSources`).
- Fix SaveButton's "already toasts" comment (the card passed a raw store toggle). The
  contract is now enforced by type: `toggleWatchlist: () => Promise<boolean>`.
- The preview store is a tiny zustand store, not a context. Cards call stable actions via
  `getState()`, so a preview open/close no longer re-renders every card on the page
  (the old context value changed on every hover).

## Action matrix (after)

| Surface | Watched | Watchlist (+lists caret) | Rate/heart | Log | Confirm unmark >1 | Series |
|---|---|---|---|---|---|---|
| Card (all pages) | – (display only) | – | – | – | n/a | display only |
| Hover preview (fine pointer / keyboard) | CompactWatchedButton | SaveButton compact | RateButton compact | QuickLog compact | yes (lazy count) | progress pill → detail; watchlist/rate/log |
| Mobile drawer (long-press, any touch) | same as preview | same | same | same | yes | same |
| Detail action bar | WatchedButton hero (×N) | SaveButton hero | SeenCluster → RateButton | Diary panel | yes (eager count) | SeriesProgressInline |

Before: the card strip, hover and drawer offered movie-only watched/watchlist with no
confirmation, no toasts and unhandled rejections. Series cards had no actions.

## Component boundaries

```
hover-card/
  geometry.ts (+test)          pure placement
  preview-store.ts             zustand: target, openedBy, holds, timers; usePreviewHold
  use-preview-data.ts          loading|ready|error + retry over hover-data-cache (8s timeout)
  hover-card-wrapper.tsx       triggers: fine-pointer intent, keyboard, long-press
  hover-card-overlay.tsx       portal, placement, morph, dismissal (≤ 300 lines)
  preview-body.tsx             shared content (variant popover | drawer)
  preview-parts.tsx            meta, ratings, providers, cast, skeleton
  mobile-quick-info-drawer.tsx Vaul drawer shell + provider-less store use
media/title-actions/
  title-actions.tsx · use-watched-toggle.ts · watched-confirm-dialog.tsx
  compact-watched-button.tsx · series-progress-pill.tsx
movie/card-core.tsx            shared personal-state hook + overlays
```

## Test plan
- `geometry.test.ts` covers: centered, left/right clamps, flip up, short viewport
  (maxHeight + scroll), card-size scaling (small/large clamps), the navbar minTop, and a
  viewport narrower than the width.
- `title-actions.test.tsx` covers:
  - Confirm-before-unmark when the count is >1 (and no confirm at 1).
  - A failed write toasts and does not throw or track.
  - Series render watchlist/rate/log plus the progress pill and no movie watched button.
  - Analytics fire after success with the title.
- `hover-card-overlay.test.tsx` covers:
  - A `null` fetch shows the fallback with Retry and View details, and Retry refetches.
  - The preview + TitleActions mount exactly once (element counts).
  - No interactive element sits inside an `<a>`.
- `movie-card.test.tsx`: the card renders no buttons (display-only) and the store
  subscription count is 1 (via a render count).
- Browser checks (:3011, 1440 and 1024):
  - home carousel, /browse, person, detail
  - small and large cards; left, right and bottom edges
  - list picker opened from the preview stays open
  - keyboard open and the error fallback
  - 390px long-press drawer, then dismissing via Back with no stuck `pointer-events`
- Bundle: per-route `entryJSFiles` gzip, before and after (performance.md item 15).
