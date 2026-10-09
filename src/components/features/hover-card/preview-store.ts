"use client";

import { createContext, createElement, useContext, useEffect, type ReactNode } from "react";
import { create } from "zustand";
import type { MovieListItem, SeriesListItem } from "@/types";

/**
 * State for the desktop card hover preview (spec 2026-10-09 D2).
 *
 * A zustand store, NOT a React context: every card on a page subscribes to the
 * preview's actions, and with a context each open/close re-rendered all of
 * them (the old provider value changed on every hover). Cards call the stable
 * actions through `usePreviewStore.getState()`; only the overlay subscribes to
 * the state.
 */

export type PreviewItem = MovieListItem | SeriesListItem;

export interface PreviewTarget {
  item: PreviewItem;
  /** The card element the preview grows out of (measured for placement). */
  anchor: HTMLElement;
  /** The image currently shown on the card (poster or wide art): the morph's ghost layer. */
  imageSrc: string | null;
  /** pointer = hover intent; keyboard = focus peek / ArrowDown. */
  openedBy: "pointer" | "keyboard";
  /** Move focus into the preview once it is shown (keyboard ArrowDown). */
  focusInside: boolean;
}

interface PreviewState {
  target: PreviewTarget | null;
  /** Open overlays (list picker, rate panel, dialogs) launched from inside the preview. */
  holds: number;
  pointerInside: boolean;
  open: (target: PreviewTarget) => void;
  /** Close now. `restoreFocus` returns focus to the card (Esc). */
  close: (opts?: { restoreFocus?: boolean }) => void;
  /** Close after the grace period unless the pointer re-enters or something holds it. */
  scheduleClose: () => void;
  cancelClose: () => void;
  setPointerInside: (inside: boolean) => void;
  hold: () => void;
  release: () => void;
}

/** Grace period between leaving the card/preview and closing (ms). */
export const PREVIEW_CLOSE_GRACE_MS = 200;

let closeTimer: ReturnType<typeof setTimeout> | null = null;
const clearCloseTimer = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

export const usePreviewStore = create<PreviewState>()((set, get) => ({
  target: null,
  holds: 0,
  pointerInside: false,

  open: (target) => {
    clearCloseTimer();
    set({ target, holds: 0, pointerInside: false });
  },

  close: (opts) => {
    clearCloseTimer();
    const { target } = get();
    set({ target: null, holds: 0, pointerInside: false });
    if (opts?.restoreFocus && target?.anchor.isConnected) {
      const link = target.anchor.querySelector<HTMLElement>("a[href]");
      (link ?? target.anchor).focus({ preventScroll: true });
    }
  },

  scheduleClose: () => {
    clearCloseTimer();
    if (!get().target) return;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      const s = get();
      if (s.holds > 0 || s.pointerInside) return;
      s.close();
    }, PREVIEW_CLOSE_GRACE_MS);
  },

  cancelClose: clearCloseTimer,

  setPointerInside: (inside) => {
    set({ pointerInside: inside });
    if (inside) clearCloseTimer();
  },

  hold: () => {
    clearCloseTimer();
    set((s) => ({ holds: s.holds + 1 }));
  },

  release: () => {
    const holds = Math.max(0, get().holds - 1);
    set({ holds });
    const s = get();
    if (holds === 0 && s.target?.openedBy === "pointer" && !s.pointerInside) s.scheduleClose();
  },
}));

const InPreviewContext = createContext(false);

/** Marks a subtree as rendered inside the hover preview (enables `usePreviewHold`). */
export function InPreviewScope({ children }: { children: ReactNode }) {
  return createElement(InPreviewContext.Provider, { value: true }, children);
}

/**
 * Keep the hover preview open while `active` (an overlay this component opened
 * from inside the preview is showing). Popovers/dialogs are portalled to
 * <body>, so moving the pointer into one leaves the preview's DOM — without a
 * hold that closed the preview and unmounted the very popover being used.
 * No-op outside a preview (detail page, mobile drawer).
 */
export function usePreviewHold(active: boolean) {
  const inPreview = useContext(InPreviewContext);
  useEffect(() => {
    if (!inPreview || !active) return;
    usePreviewStore.getState().hold();
    return () => usePreviewStore.getState().release();
  }, [inPreview, active]);
}
