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

## AI chat window controls (consolidated June 2026)

X always dismisses to the idle bubble and NEVER clears the conversation;
"New conversation" (RotateCcw, rendered only when messages exist) is the sole
destructive action. Recipes in DESIGN.md → Components. Don't reintroduce a
separate minimize-vs-close pair.

See also: `.claude/rules/design-system.md` (layout facts, safe-area rules),
`.claude/rules/ai-components.md` (chat component structure),
`.claude/rules/performance.md` (Playwright measurement gotchas).
