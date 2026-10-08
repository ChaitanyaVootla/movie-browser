/**
 * Scroll restoration core — pure, DOM-injectable logic behind
 * `<ScrollRestoration />` (src/components/features/layout/scroll-restoration.tsx).
 *
 * WHY THIS EXISTS (Oct 2026): Back from a detail page used to land at the top of
 * long lists (browse, library, watchlist, search). Two causes stacked:
 *   1. The old global `ScrollToTop` called `window.scrollTo(0, 0)` on EVERY
 *      pathname change — including Back/Forward — clobbering whatever position
 *      the browser had restored.
 *   2. Client-rendered lists (infinite browse grid, query-backed library tabs)
 *      remount shorter than they were (page 1 only / skeleton), so even a
 *      correct restore is clamped by the document height.
 * The browser's native `scrollRestoration = "auto"` cannot handle (2): it
 * restores once, at popstate time, against whatever DOM exists then. This module
 * instead keeps positions per URL in sessionStorage and re-applies the saved
 * position each frame until the document is tall enough and the position has
 * held for a short settle window (or the user takes over, or it times out).
 *
 * Positions are keyed by URL (pathname + search), not by history entry: Next's
 * router owns `history.state`, and `useHistoryDismiss` pushes its own
 * same-URL entries, so a per-entry key would fight both.
 */

export const SCROLL_STORE_KEY = "mb:scroll-positions:v1";
/** Bound the stored map so sessionStorage can't grow without limit. */
export const MAX_SCROLL_ENTRIES = 80;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** URL key for a location: pathname + search (hash ignored — anchors scroll themselves). */
export function scrollKeyFor(loc: { pathname: string; search: string }): string {
  return `${loc.pathname}${loc.search}`;
}

function readMap(storage: StorageLike): Record<string, number> {
  try {
    const raw = storage.getItem(SCROLL_STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Saved Y for a URL key, or null if none. */
export function getSavedScroll(storage: StorageLike, key: string): number | null {
  const map = readMap(storage);
  return key in map ? map[key] : null;
}

/**
 * Persist a Y for a URL key. Most-recently-saved entries are kept (insertion
 * order = recency; a re-save moves the key to the end) and the oldest are
 * evicted past MAX_SCROLL_ENTRIES. Storage failures (quota, privacy mode) are
 * swallowed — restoration is a nicety, never a crash.
 */
export function saveScroll(storage: StorageLike, key: string, y: number): void {
  if (!Number.isFinite(y) || y < 0) return;
  const map = readMap(storage);
  delete map[key];
  map[key] = Math.round(y);
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length - MAX_SCROLL_ENTRIES; i += 1) delete map[keys[i]];
  try {
    storage.setItem(SCROLL_STORE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export type RestoreOutcome = "restored" | "timeout" | "cancelled";

export interface RestoreDeps {
  getScrollY(): number;
  /** Largest reachable scrollY right now (scrollHeight - viewport height). */
  getMaxScrollY(): number;
  scrollTo(y: number): void;
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  /** True while some list on the page has declared it is still loading. */
  isGated(): boolean;
}

export interface RestoreOptions {
  /** Target must hold this long (ms) before we stop pinning it. */
  settleMs?: number;
  /** Give up after this long when nothing is gating. */
  timeoutMs?: number;
  /** Give up after this long if a gate was ever seen (slow client fetch). */
  gatedTimeoutMs?: number;
}

export interface RestoreHandle {
  cancel(): void;
  readonly done: Promise<RestoreOutcome>;
}

/**
 * Drive the window to `target`, frame by frame:
 * - wait while gated or while the document is too short to reach the target;
 * - once reachable, scroll there and keep re-applying it (late images/rows can
 *   shift layout) until it has held for `settleMs`;
 * - on timeout, land as close as possible (min(target, max)).
 */
export function runRestore(
  target: number,
  deps: RestoreDeps,
  { settleMs = 350, timeoutMs = 3000, gatedTimeoutMs = 8000 }: RestoreOptions = {},
): RestoreHandle {
  let frame = 0;
  let finished = false;
  let resolveDone!: (o: RestoreOutcome) => void;
  const done = new Promise<RestoreOutcome>((r) => {
    resolveDone = r;
  });
  const start = deps.now();
  let heldSince: number | null = null;
  let everGated = false;

  const finish = (outcome: RestoreOutcome) => {
    if (finished) return;
    finished = true;
    if (frame) deps.cancelFrame(frame);
    resolveDone(outcome);
  };

  const tick = () => {
    if (finished) return;
    const t = deps.now();
    const gated = deps.isGated();
    if (gated) everGated = true;
    const max = deps.getMaxScrollY();

    if (!gated && max >= target - 1) {
      if (Math.abs(deps.getScrollY() - target) > 1) deps.scrollTo(target);
      if (heldSince === null) heldSince = t;
      if (t - heldSince >= settleMs) {
        finish("restored");
        return;
      }
    } else {
      heldSince = null;
    }

    if (t - start >= (everGated ? gatedTimeoutMs : timeoutMs)) {
      deps.scrollTo(Math.max(0, Math.min(target, deps.getMaxScrollY())));
      finish("timeout");
      return;
    }
    frame = deps.requestFrame(tick);
  };

  frame = deps.requestFrame(tick);
  return { cancel: () => finish("cancelled"), done };
}
