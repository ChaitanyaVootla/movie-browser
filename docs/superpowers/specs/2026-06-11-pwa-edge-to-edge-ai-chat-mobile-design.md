# PWA Edge-to-Edge + AI Chat Mobile Keyboard & Controls — Design

Date: 2026-06-11 · Status: implemented in the same session (autonomous run; user asked to
"thoroughly fix", so design decisions were made inline and recorded here).

## Problems

1. **Installed PWA doesn't blend with the phone's system bars** (tested: Samsung S25
   Ultra). Native apps (Apple TV) appear to "bleed" under the status/gesture bars.
2. **AI chat (Cue) is broken under the mobile keyboard**: opening the keyboard pushes
   the drawer content off the top of the screen; assorted positioning glitches.
3. **Chat window controls are confusing**: MinimalView crams Send/Expand/Minimize/Close
   into the input row; Minimize (chevron) and Close (X) both return to the bubble and
   differ only in whether they silently destroy the conversation.

## Platform facts (verified June 2026)

- An installed **standalone** PWA on Android cannot draw under the **top status bar**;
  the status bar is painted with the page's `theme-color`. The "bleed" illusion =
  status-bar color exactly matching the visible app background.
- **Bottom** gesture-bar bleed works via `viewport-fit=cover` (already set) +
  `env(safe-area-inset-bottom)` handling (Chrome 135+ edge-to-edge).
- Android Chrome's default keyboard mode is `interactive-widget=resizes-visual`: the
  *layout* viewport (and `position:fixed` elements, and all viewport units) keep their
  full height when the keyboard opens — only the visual viewport shrinks. This is the
  root cause of "drawer top off-screen". `interactive-widget=resizes-content` makes the
  keyboard resize the layout viewport, so `dvh` and fixed-bottom elements just work.
  iOS Safari ignores `interactive-widget`; Vaul's built-in `repositionInputs` covers it.

## Decisions

### A. Status/system-bar blending
- New `ThemeColorSync` client component (mounted in the root layout): reads the
  computed `body` background (browser resolves OKLch → rgb), writes it to a single
  `<meta name="theme-color">`, removes the SSR media-scoped pair, and re-syncs via a
  `MutationObserver` on `<html class>` (covers next-themes mode + `.style-*`/`.accent-*`
  changes). Status bar now always equals the app canvas, per-theme.
- `manifest.json`: `theme_color`/`background_color` → `#000000` (DESIGN.md canvas is
  `oklch(0 0 0)`; `#171717` was stale) — fixes splash + initial window frame.
- Safe-area gaps fixed: mobile idle bubble offset gains `+ env(safe-area-inset-bottom)`;
  chat drawer input area gains safe-area bottom padding.

### B. Keyboard
- Add `interactiveWidget: "resizes-content"` to the root `viewport` export (app-wide:
  also fixes search palette & any focused input under keyboard on Android).
- Mobile drawer: delete the manual `visualViewport` → `maxHeight` JS (conflicts with
  Vaul's own `repositionInputs` and becomes a no-op under resizes-content). Static
  `max-height: 92dvh` (dvh shrinks with the keyboard under resizes-content; DESIGN.md
  bans `vh` anyway). iOS handled by Vaul.
- Desktop MinimalView/ExpandedChat keep a visualViewport fallback (tablets/touch
  desktops), deduped into one hook `use-keyboard-inset.ts`.

### C. Controls consolidation
Principle: **X never destroys the conversation** (threads persist server-side anyway);
"New chat" is the only destructive action and is explicitly labeled.
- MinimalView input row: `Send · Expand · X(dismiss-to-bubble)` — chevron Minimize
  removed; Escape dismisses (used to clear!).
- ExpandedChat header: `New chat · Collapse(to minimal) · X(dismiss-to-bubble)`;
  Escape collapses.
- Mobile drawer header: `New chat (when conversation) · ChevronDown(dismiss)`; swipe
  and scrim still dismiss.
- `assistant-floaty`: `handleClose` no longer calls `clearMessages` — unified dismiss.

## Out of scope (suggested follow-ups, not implemented)
- Mobile drawer shows only the latest assistant reply; full message history (like
  ExpandedChat) on mobile would be the next UX step.
- Multiline input (textarea with Shift+Enter) for longer prompts.
- `display_override` / richer manifest screenshots for install UI.
