"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useMounted } from "@/hooks/use-mounted";
import { computePreviewPlacement, type Placement, type Rect } from "./geometry";
import { InPreviewScope, usePreviewStore, type PreviewTarget } from "./preview-store";
import { usePreviewData } from "./use-preview-data";
import { usePressDragDismiss } from "./use-press-drag-dismiss";
import { growPanel, morphIn, type VerticalBox } from "./preview-morph";
import { nextTabbableAfter, tabEdge } from "./preview-focus";
import { LazyPreviewBody as PreviewBody, PreviewChunkBoundary } from "./lazy-preview-body";

/** Distance kept from every viewport edge (px). */
const EDGE = 12;
/** Desktop navbar (64px, DESIGN.md) + breathing room. */
const NAVBAR_CLEARANCE = 64 + 8;

/**
 * Stable per-element key. The panel is keyed on anchor + title, so the SAME
 * title opened from a DIFFERENT card (two rows showing one film) remounts and
 * re-measures. Keyed on the title id alone, it kept the first card's rect and
 * floated over the wrong card.
 */
const anchorKeys = new WeakMap<Element, number>();
let nextAnchorKey = 1;
function anchorKey(el: Element): number {
  let k = anchorKeys.get(el);
  if (k === undefined) {
    k = nextAnchorKey++;
    anchorKeys.set(el, k);
  }
  return k;
}

const toRect = (r: DOMRect): Rect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/**
 * The card hover preview (spec 2026-10-09 D2). Portalled to <body>, z-50 (the
 * app's single overlay tier). Popovers and dialogs opened from inside it portal
 * in AFTER it, so they always stack above it.
 */
export function HoverCardOverlay() {
  const mounted = useMounted();
  const target = usePreviewStore((s) => s.target);
  const close = usePreviewStore((s) => s.close);

  // Any route change closes it (art link, cast links, back/forward).
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    const timer = setTimeout(() => close(), 0);
    return () => clearTimeout(timer);
  }, [pathname, close]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <PreviewPanel
          key={`${"title" in target.item ? "m" : "s"}${target.item.id}@${anchorKey(target.anchor)}`}
          target={target}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}

function PreviewPanel({ target }: { target: PreviewTarget }) {
  const { item, anchor } = target;
  const isMovie = "title" in item;
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const cardRect = useRef<Rect | null>(null);
  const morphed = useRef(false);
  const morphAnim = useRef<Animation | null>(null);
  /** The panel's on-screen box once shown (null while hidden): growth is FLIPped from it. */
  const shownBox = useRef<VerticalBox | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [navPending, setNavPending] = useState(false);
  // The preview opens UNDER the resting cursor (it grows out of the card), so a
  // plain :hover affordance on the art link was on at every open and read as a
  // stuck underline. Hover styling arms on the first real pointer movement.
  const [pointerMoved, setPointerMoved] = useState(false);
  const { state, retry } = usePreviewData(item.id, isMovie ? "movie" : "series");

  const store = usePreviewStore.getState;
  const closeNow = useCallback((restoreFocus = false) => store().close({ restoreFocus }), [store]);
  const pressDrag = usePressDragDismiss(() => closeNow());

  // --- placement: measure the card + the REAL content height ---------------
  const place = useCallback(() => {
    const content = contentRef.current;
    // Stay hidden until the lazily-loaded body has rendered (no height yet).
    if (!content || content.offsetHeight === 0) return;
    if (!cardRect.current) {
      const art = anchor.querySelector("[data-card-art]") ?? anchor;
      cardRect.current = toRect(art.getBoundingClientRect());
    }
    const next = computePreviewPlacement({
      card: cardRect.current,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      height: content.offsetHeight,
      edge: EDGE,
      minTop: window.innerWidth >= 768 ? NAVBAR_CLEARANCE : EDGE,
    });
    // Already open and the content changed height (details arriving): apply the
    // new box NOW, before paint, and open the clip from the old box to the new
    // one. Waiting for React's commit painted a frame where the panel was at its
    // full height while the new rows were still invisible: the empty block.
    const panel = panelRef.current;
    const prevBox = shownBox.current;
    if (panel && prevBox) {
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
      panel.style.width = `${next.width}px`;
      panel.style.maxHeight = next.maxHeight == null ? "" : `${next.maxHeight}px`;
      const r = panel.getBoundingClientRect();
      const nextBox = { top: r.top, bottom: r.bottom };
      // During the entrance morph its own clip is opening to the full panel.
      if (morphAnim.current?.playState !== "running") {
        growPanel(panel, prevBox, nextBox, reduceMotion);
      }
      shownBox.current = nextBox;
    }
    setPlacement((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next
    );
  }, [anchor, reduceMotion]);

  useLayoutEffect(() => {
    place();
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => place());
    ro.observe(content);
    return () => ro.disconnect();
  }, [place]);

  // --- the grow-out morph: runs once, before first paint after placement ---
  useLayoutEffect(() => {
    if (!placement || morphed.current) return;
    morphed.current = true;
    const panel = panelRef.current;
    morphAnim.current = morphIn({
      panel,
      ghost: ghostRef.current,
      art: artRef.current,
      placement,
      reduceMotion,
    });
    if (panel) {
      const r = panel.getBoundingClientRect();
      shownBox.current = { top: r.top, bottom: r.bottom };
    }
  }, [placement, reduceMotion]);

  // --- focus: keyboard ArrowDown moves focus inside --------------------------
  // ONCE per open: placement re-runs when the height changes (details
  // arriving), and re-focusing then would yank focus back from wherever the
  // user had tabbed to. If the lazily-loaded body isn't in the DOM yet, wait
  // for it.
  const focusedInside = useRef(false);
  const hasPlacement = placement !== null;
  useEffect(() => {
    if (!hasPlacement || !target.focusInside || focusedInside.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    const tryFocus = () => {
      // First action (a selector LIST would return the art link: document order).
      const first =
        panel.querySelector<HTMLElement>("[data-title-actions] :is(button, a[href])") ??
        panel.querySelector<HTMLElement>("a[href]");
      if (!first) return false;
      focusedInside.current = true;
      first.focus({ preventScroll: true });
      return true;
    };
    if (tryFocus()) return;
    const mo = new MutationObserver(() => {
      if (tryFocus()) mo.disconnect();
    });
    mo.observe(panel, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [hasPlacement, target.focusInside]);

  // --- dismissal ------------------------------------------------------------
  useEffect(() => {
    const inPanel = (n: EventTarget | null) => n instanceof Node && !!panelRef.current?.contains(n);
    const held = () => store().holds > 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || held()) return; // a nested popover/dialog owns Esc
      e.preventDefault();
      closeNow(true);
    };
    // Close on PAGE scroll (incl. a carousel row), never on scroll inside the
    // preview or inside an overlay it opened (list picker scroll area).
    const onScroll = (e: Event) => {
      if (inPanel(e.target) || held()) return;
      closeNow();
    };
    // Not while a nested overlay is open: closing would unmount e.g. the Log
    // dialog and discard a typed note (a resize also fires for zoom / devtools).
    const onResize = () => {
      if (!held()) closeNow();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (inPanel(e.target) || held() || anchor.contains(e.target as Node)) return;
      closeNow();
    };

    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [anchor, closeNow, store]);

  const onFocusOut = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (panelRef.current?.contains(next) || anchor.contains(next))) return;
    // Let a portalled overlay that is taking focus register its hold first.
    setTimeout(() => {
      const active = document.activeElement;
      if (store().holds > 0 || (active && panelRef.current?.contains(active))) return;
      if (next) closeNow();
    }, 0);
  };

  // Tab / Shift+Tab at the panel edges: never strand focus at the end of
  // <body> (where the portal lives). See preview-focus.ts.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || store().holds > 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const edge = tabEdge(panel, document.activeElement, e.shiftKey);
    if (!edge) return;
    e.preventDefault();
    if (edge === "before-first") {
      closeNow(true);
      return;
    }
    const next = nextTabbableAfter(anchor, panel);
    closeNow();
    next?.focus();
  };

  const shown = placement !== null;

  return (
    <m.div
      ref={panelRef}
      data-hover-preview=""
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      initial={false}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.08 : 0.12 } }}
      style={{
        position: "fixed",
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: placement?.width ?? 320,
        maxHeight: placement?.maxHeight ?? undefined,
        visibility: shown ? "visible" : "hidden",
      }}
      className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover text-popover-foreground shadow-lg scrollbar-hide"
      onPointerEnter={() => store().setPointerInside(true)}
      onPointerMoveCapture={(e) => {
        if (!pointerMoved && (e.movementX !== 0 || e.movementY !== 0)) setPointerMoved(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        store().setPointerInside(false);
        if (!navPending) store().scheduleClose();
      }}
      onBlur={onFocusOut}
      onKeyDown={onKeyDown}
      {...pressDrag}
    >
      {/* Ghost: the card's own artwork, starting exactly over the card, then
          morphing into the art region and fading out (preview-morph.ts). */}
      {target.imageSrc && !reduceMotion && (
        <div
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none absolute z-10 overflow-hidden"
          style={{ opacity: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- already-loaded card src, exact pixels */}
          <img
            src={target.imageSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      )}
      <div ref={contentRef}>
        <InPreviewScope>
          <PreviewChunkBoundary item={item} onClose={() => closeNow()}>
            <PreviewBody
              item={item}
              state={state}
              onRetry={retry}
              variant="popover"
              titleId={titleId}
              artRef={artRef}
              onNavPendingChange={setNavPending}
              stagger={!reduceMotion}
              hoverAffordance={pointerMoved}
            />
          </PreviewChunkBoundary>
        </InPreviewScope>
      </div>
    </m.div>
  );
}
