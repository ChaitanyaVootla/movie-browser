/**
 * Keyboard focus helpers for the hover preview (spec 2026-10-09 D2, review fix).
 *
 * The preview is portalled to the END of <body>, so a plain Tab out of its last
 * control used to land on browser chrome or the footer, and Shift+Tab out of
 * its first control on whatever preceded the portal. Either way the user lost
 * their place in the grid. The panel handles Tab/Shift+Tab at its edges:
 *   Shift+Tab on the first control → close, focus back on the card.
 *   Tab past the last control      → close, focus the next focusable AFTER the
 *                                    card in document order (the next card).
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isTabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  if (el.closest("[inert], [aria-hidden='true']")) return false;
  // Rendered (display:none / detached elements have no client rects).
  return el.getClientRects().length > 0 || el === document.activeElement;
}

/** Tabbable descendants of `root`, in DOM order. */
export function getTabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isTabbable);
}

/**
 * The first tabbable element that FOLLOWS `anchor` in document order (outside
 * `anchor` itself and outside `exclude`, i.e. the preview panel). Null at the end
 * of the document.
 */
export function nextTabbableAfter(anchor: Element, exclude?: Element | null): HTMLElement | null {
  for (const el of getTabbables(document)) {
    if (anchor.contains(el) || exclude?.contains(el)) continue;
    if (anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return el;
  }
  return null;
}

export type TabEdge = "before-first" | "after-last" | null;

/** Whether a Tab keypress from `active` would leave `panel` at one of its edges. */
export function tabEdge(panel: Element, active: Element | null, shift: boolean): TabEdge {
  const items = getTabbables(panel);
  if (items.length === 0) return shift ? "before-first" : "after-last";
  if (shift && active === items[0]) return "before-first";
  if (!shift && active === items[items.length - 1]) return "after-last";
  return null;
}
