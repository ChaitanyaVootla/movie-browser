/**
 * Platform detection shared across mobile drawers.
 *
 * `IS_IOS` gates vaul's `repositionInputs`: Android Chrome uses
 * `interactive-widget=resizes-content` (the layout viewport shrinks with the
 * keyboard), so vaul's extra `bottom: keyboardHeight` offset double-compensates
 * and floats the input a full keyboard-height above the keyboard (the Jun-12
 * 2026 bug — see .claude/rules/pwa-mobile.md). iOS ignores
 * `interactive-widget`, so vaul's handling is needed THERE only. Pass
 * `repositionInputs={IS_IOS}` to any `<Drawer>` containing a focusable text
 * input. Covers iPadOS reporting a desktop UA (Mac + touch points).
 */
export const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));
