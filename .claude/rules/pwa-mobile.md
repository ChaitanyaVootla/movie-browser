# PWA & Mobile Viewport Behavior

How the installed app blends with Android system bars and how the virtual
keyboard is handled app-wide. Established June 2026 (S25 Ultra polish pass).

## System-bar blending (the "edge-to-edge native look")

- An installed **standalone** PWA on Android CANNOT draw under the top status
  bar — re-verified against Chrome docs Jun 2026: Chrome's edge-to-edge (135+)
  extends the viewport into the **bottom** gesture bar only; no top-edge
  support exists or is announced. The only true Android top-bleed paths are
  `display: fullscreen` (hides clock/battery — rejected, not native-like) or
  a TWA wrapper (native activity, Play Store distribution). On **iOS**
  standalone, `black-translucent` (set via `appleWebApp.statusBarStyle`) DOES
  draw content under the status bar — there `safe-area-inset-top` = status
  bar height (it is 0 on Android standalone).
- So the Android "bleed" is an illusion with two halves (DESIGN.md → Layout →
  System bars): the status bar is painted with `theme-color` = whatever sits
  under the seam, and mobile hero imagery fades to **solid** `--hero-base` at
  its top edge via `.hero-top-scrim` (globals.css). Any alpha < 1 at y=0 of a
  mobile hero reads as a hard seam against the opaque bar.
- `ThemeColorSync` (`src/components/features/layout/theme-color-sync.tsx`,
  mounted in the root layout) owns the color: while a `[data-hero-root]`
  element (MediaBackdrop / HeroBackdropShell roots, both `bg-hero-base`)
  covers the status-bar seam it uses that element's computed background,
  otherwise the computed `body` background (browser resolves the OKLch
  token); re-evaluated on theme change, navigation, and rAF-throttled window
  scroll. This is what keeps light mode correct (light canvas, dark hero).
  It writes the color into the `content` of EVERY existing `theme-color` meta
  (both SSR media-scoped variants get the same color — whichever Chrome
  matches is right). **NEVER `.remove()` those metas — they are React-owned
  (root `viewport` export); removing them crashed every client navigation
  with `null.removeChild` in React's metadata commit (Jun 12 2026).** Two
  MutationObservers re-sync: `<html class>` (mode/style/accent change) and
  `document.head` childList (React swaps the metas back to first-paint colors
  on every navigation). Don't add static theme-color metas anywhere.
- Non-hero mobile surfaces must clear the iOS status bar with
  `env(safe-area-inset-top)` (no-op on Android): `PAGE_SHELL` in
  `src/lib/design.ts` carries it, as do sticky bars (`STICKY_BAR_SAFE_AREA`)
  and the compact (no-backdrop) hero in `hero-backdrop-shell.tsx`.
- Note: modern Chromium serializes the computed color as `lab(...)` — that's
  fine; the same engine parses it for the status bar.
- Bottom gesture-bar bleed = `viewportFit: "cover"` (root layout) + honest
  `env(safe-area-inset-bottom)` on every fixed-bottom element (bottom nav, AI
  bubble, chat drawer input). The bottom nav's height GROWS by the inset, so
  anything stacked above it must add the inset to its offset too.
- `manifest.json` `theme_color`/`background_color` are `#000000` (DESIGN.md
  canvas, splash screen) — keep in sync if the default canvas ever changes.

## Virtual keyboard: `interactive-widget=resizes-content`

- The root `viewport` export sets `interactiveWidget: "resizes-content"`.
  Without it, Android Chrome only shrinks the *visual* viewport when the
  keyboard opens — `position:fixed` panels and `dvh` keep full height and
  their tops slide off-screen (this was the broken AI-chat-under-keyboard
  bug). With it, the layout viewport (and ALL viewport units) resize, so
  fixed-bottom UI and `dvh` heights just work. App-wide setting; applies to
  search palette and any focused input too.
- iOS ignores `interactive-widget`. Fallbacks: Vaul's `repositionInputs`
  covers the mobile chat drawer **on iOS ONLY** — it must be `false` on
  Android (`repositionInputs={IS_IOS}` in `mobile-chat-drawer.tsx`). Vaul
  assumes the keyboard OVERLAYS the page and adds `bottom: keyboardHeight`
  to the drawer; with `resizes-content` the fixed drawer already tracks the
  shrunken layout viewport, so vaul's offset double-compensated → a full
  keyboard-height gap between input and keyboard (Jun 12 2026). Any
  fixed-bottom input inside a Vaul drawer needs this gating. Desktop
  floating chat panels use `useKeyboardInset()`
  (`src/hooks/use-keyboard-inset.ts`) — a visualViewport listener that is ~0
  on Android by construction. Do NOT add new ad-hoc visualViewport math; use
  the hook.
- Chat drawer focus discipline: focus the input in Vaul's `onAnimationEnd`
  (mid-flight focus makes the keyboard resize fight the 500ms drawer
  transition) and only when the conversation is empty — with messages
  present the user opens the drawer to READ; the keyboard would cover them.

## Mobile overlays = Vaul drawers + Back-button dismiss (June 2026)

Every mobile slide-up surface MUST be a **Vaul `Drawer`** (`@/components/ui/drawer`),
never a Radix `Sheet side="bottom"` (no drag-to-dismiss) or a centered `Dialog`.
Vaul gives the native feel for free: drag-down to dismiss, velocity snap, scrim
tap, smooth spring. The responsive pattern is `isMobile ? <Drawer> : <Dialog>` (or
`<Popover>` / `<Sheet>` on desktop) — DESIGN.md → "Dialogs vs Drawers".

**Back-button dismiss is mandatory and centralized.** A drawer/dialog's open state
is pure React state, invisible to browser history — so on mobile the hardware/
gesture Back button navigated the page *behind* the open overlay (page changed,
overlay stayed = the "back went back a page but the modal remained" bug). Fixed by
**`useHistoryDismiss(open, onClose)`** (`src/hooks/use-history-dismiss.ts`):

- Call it once per overlay open-state, e.g. `useHistoryDismiss(open, () => onOpenChange(false))`.
  For nested layers (diary panel → log form → edit → delete), call it once **per
  layer** — a module-level stack closes only the top-most one per Back press.
- It is **mobile-gated** (`matchMedia("(max-width: 767px)")` = the `useMobile`
  breakpoint), so it is a no-op on desktop; pass the raw `open` even for responsive
  components that render a `Dialog` on desktop.
- Mechanics: on open it `pushState`s one synthetic entry; `popstate` (Back) closes
  the top overlay instead of navigating; any other close (scrim/drag/X/select)
  unwinds the synthetic entry via a suppressed `history.back()` so Back is never
  "dead" and a forward in-drawer navigation is never undone.
- **Do NOT hand-roll `pushState`/`popstate` per component** (search-command's old
  bespoke handler leaked a dangling entry on non-Back closes — replaced). One hook,
  everywhere. Every Vaul `Drawer` consumer + `search-command` + `trailer-modal` +
  `profile-settings-dialog` now route through it.
- The `mobile-quick-info-drawer` keeps its `usePathname` auto-close as a separate
  safety (closes after an in-drawer link navigation); the hook coexists because
  `removeOverlay` skips the synthetic `back()` once history has moved forward.
- **Multi-second page FREEZE after a Back/programmatic close — the controlled-prop
  pointer-events strand (diagnosed Jun 20 2026, took a full repro to pin down).**
  Vaul wraps a Radix **modal** Dialog, whose `DismissableLayer` sets
  `document.body.style.pointerEvents = "none"` while open and only clears it when
  the layer UNMOUNTS. Vaul papers over that lag by resetting it to `"auto"`
  synchronously — but **only inside its `useControllableState` `onChange`, which
  fires solely on Vaul's OWN close paths** (drag, scrim tap, Esc, the close
  button). When the drawer is closed by flipping the controlled `open` prop from
  the OUTSIDE — exactly what `useHistoryDismiss` does on a hardware/gesture **Back**
  (`popstate` → `close()` → `setOpen(false)`), and what ANY programmatic
  `setOpen(false)` does (e.g. the Rate drawer's "Write a review") — Vaul's setter
  never runs, `onChange` never fires, and the reset is skipped. The body stays
  `pointer-events:none` (whole page untappable, can't scroll) until Radix's layer
  finally unmounts a close-animation (or a delayed router re-render) later — "frozen
  for a few seconds." Drag/scrim/Esc do NOT freeze; only the controlled-prop close
  does. **Fix lives in `useHistoryDismiss` (`releaseStrandedBodyLock`)**: after a
  Back close (`handlePopState`) and on every overlay teardown (`removeOverlay`), if
  OUR overlay stack is now empty it clears `body.style.pointerEvents` — matching
  Vaul's own internal behaviour, no-op on Vaul-internal closes, and guarded so a
  still-open lower (nested) overlay keeps the background locked. Two layers: an
  IMMEDIATE synchronous clear keyed off our overlay `stack` (updated
  synchronously — the DOM's `data-state` only flips on the next render, so it is
  NOT reliable at clear-time), plus a DEFERRED DOM-authoritative `bodyLockSweep`
  (~650ms, past the close animation) that releases the lock iff no
  `[role="dialog"|"alertdialog"][data-state="open"]` is actually present — a
  backstop for any path the sync clear missed (stack desync, a teardown that
  skipped cleanup, a re-applied lock). This same strand also bites the
  **mobile-quick-info-drawer → tap in-drawer link → navigate** flow (the drawer
  closes via its `usePathname` effect = a controlled-prop close, stranding a
  synthetic history entry) — the destination page would otherwise load frozen;
  the `removeOverlay` clear covers it. Verify any drawer change by DISMISSING VIA
  BACK on a mobile viewport (a drag-dismiss repro looks fine and HIDES this — only
  Vaul-internal closes run line 901) and confirming `getComputedStyle(document
  .body).pointerEvents` is not stuck at `none`.
- **The BIG one — "stuck for a few seconds after closing ANY drawer" (the scroll
  freeze, diagnosed Jun 21 2026, real in BOTH dev AND prod ~4s).** Distinct from
  the pointer-events strand above and far more impactful. On a hardware/gesture
  **Back** dismiss, the Vaul Drawer is closed by flipping its controlled `open`
  prop; `data-state` flips to `"closed"` within ~60ms, but the **exit animation
  never runs** (the same popstate drives Next's router re-render, which prevents
  the fade/slide keyframes from starting). Radix `Presence` keeps the element
  mounted until it receives the `animationend` it is waiting for — which never
  fires — so the whole Radix Dialog subtree (scrim + focus-guard + the
  `react-remove-scroll` **non-passive `touchmove` lock**) **lingers mounted ~4s**.
  Result: taps work (we clear pointer-events) but the page **cannot be SCROLLED**
  and stays dimmed for ~4s. Esc/scrim/drag (Vaul's INTERNAL close) animate and
  unmount in ~460ms — only the controlled-prop/Back close strands. **The trap that
  cost a full investigation: `window.scrollTo()` BYPASSES touch-event blocking, so
  every `scrollTo`-based probe shows "scrollable" while a real finger-swipe is dead
  — you MUST measure with real touch (CDP `Input.dispatchTouchEvent`) or by
  watching `[data-vaul-overlay]` mount duration.** Fix lives in `useHistoryDismiss`
  (`flushClosingVaulOverlays` + `scheduleOverlayFlush`): after a Back close,
  dispatch the `animationend`/`transitionend` Radix is waiting for onto
  `[data-vaul-overlay|data-vaul-drawer][data-state="closed"]` nodes — `Presence`
  then unmounts at once (~100-250ms vs ~4000ms). Retried across [100,250,500]ms
  because the close commits `data-state="closed"` a render later (a single rAF can
  fire too early); only `data-state="closed"` nodes are targeted so an OPENING
  overlay is never cut short; nested overlays are safe (a still-open lower drawer
  is `data-state="open"`). `removeOverlay` schedules the same flush at
  `UNWIND_DELAY_MS` as a backstop for programmatic controlled-prop closes
  (quick-info `usePathname` close, "Write a review"). Things that did NOT work
  (don't retry them): `flushSync(close)` (the UNMOUNT, not the close, is what's
  deferred); capture-phase `stopImmediatePropagation` to suppress Next's popstate
  (for an event targeted at `window`, listeners fire in REGISTRATION order, and
  Next registers first); dispatching `Escape` (still a controlled-prop close).
- **NOT the freeze: plain movie→movie→Back RSC re-init is dev-only.** Measured
  (Jun 21 2026) identical RSC-refetch counts on Back whether or not the hook was
  ever armed (a drawer opened this session) — so `useHistoryDismiss` does NOT
  pollute Next 16's history/bfcache or worsen plain back-navigation. The ~dozen
  RSC POSTs a Back triggers in DEV are Next's dev-mode page re-init (the page
  re-runs its client server-actions: `getRating`, watch-providers, enrichment
  SSE); fast in prod. Don't chase this as a hook bug. (Aside: the hook's deferred
  unwind `history.back()` does make Next re-traverse the page ~600ms after a
  non-Back drawer close — harmless client restore in prod, RSC churn in dev.)

## AI chat window controls (consolidated June 2026)

X always dismisses to the idle bubble and NEVER clears the conversation;
"New conversation" (RotateCcw, rendered only when messages exist) is the sole
destructive action. Recipes in DESIGN.md → Components. Don't reintroduce a
separate minimize-vs-close pair.

See also: `.claude/rules/design-system.md` (layout facts, safe-area rules),
`.claude/rules/ai-components.md` (chat component structure),
`.claude/rules/performance.md` (Playwright measurement gotchas).

## Service worker MUST NOT intercept navigations (Jun 2026)

`src/app/sw.ts` (Serwist, auto-registered via `@serwist/turbopack` + the
`src/app/serwist/[[...path]]/route.ts` route — there is NO `SerwistProvider`, so
no `disable`/`cacheOnNavigation` prop to toggle). **Navigations are handled by a
`NetworkOnly` runtime-caching route (matcher `request.mode === "navigate"`,
placed FIRST) and `navigationPreload` is OFF.** Background: with
`navigationPreload: true` and the default pages strategy, a **direct load / hard
refresh** of an RSC-streamed route under `loading.tsx` (e.g. `/series/.../discussions`,
movie/series detail) was served as a **DOWNLOAD** instead of a page — the
"discussions page not accessible / routing race" bug. Client-side (soft) nav was
unaffected, which masked it. Offline still works: `NetworkOnly` throws on network
failure → the `fallbacks` `/~offline` document entry catches it. **Do NOT re-enable
`navigationPreload` or add a cache-first/NetworkFirst strategy for `mode:navigate`**
— let navigations always hit the network. Verify any SW change by DIRECT-loading a
streamed route with the SW active (not just clicking a link).
