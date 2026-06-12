# PWA & Mobile Viewport Behavior

How the installed app blends with Android system bars and how the virtual
keyboard is handled app-wide. Established June 2026 (S25 Ultra polish pass).

## System-bar blending (the "edge-to-edge native look")

- An installed **standalone** PWA on Android CANNOT draw under the top status
  bar. The status bar is painted with the page's `<meta name="theme-color">` —
  blending = making that color always equal the visible canvas.
- `ThemeColorSync` (`src/components/features/layout/theme-color-sync.tsx`,
  mounted in the root layout) owns this: it reads the computed `body`
  background (browser resolves the OKLch `--background` token) and writes it
  into the `content` of EVERY existing `theme-color` meta (both SSR
  media-scoped variants get the same color — whichever Chrome matches is
  right). **NEVER `.remove()` those metas — they are React-owned (root
  `viewport` export); removing them crashed every client navigation with
  `null.removeChild` in React's metadata commit (Jun 12 2026).** Two
  MutationObservers re-sync: `<html class>` (mode/style/accent change) and
  `document.head` childList (React swaps the metas back to first-paint colors
  on every navigation). Don't add static theme-color metas anywhere.
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
- iOS ignores `interactive-widget`. Fallbacks: Vaul's built-in
  `repositionInputs` covers the mobile chat drawer; desktop floating chat
  panels use `useKeyboardInset()` (`src/hooks/use-keyboard-inset.ts`) — a
  visualViewport listener that is ~0 on Android by construction. Do NOT add
  new ad-hoc visualViewport math; use the hook.

## AI chat window controls (consolidated June 2026)

X always dismisses to the idle bubble and NEVER clears the conversation;
"New conversation" (RotateCcw, rendered only when messages exist) is the sole
destructive action. Recipes in DESIGN.md → Components. Don't reintroduce a
separate minimize-vs-close pair.

See also: `.claude/rules/design-system.md` (layout facts, safe-area rules),
`.claude/rules/ai-components.md` (chat component structure),
`.claude/rules/performance.md` (Playwright measurement gotchas).
