"use client";

import { create } from "zustand";
import type { PreviewItem } from "./preview-store";

/**
 * Touch long-press quick-info drawer state. It is a store rather than a context
 * for the same reason as the preview store: cards only need the stable `open`
 * action, so opening the drawer must not re-render every card on the page.
 * `item` outlives `isOpen` so the drawer keeps its content through the close
 * animation.
 */
interface QuickInfoState {
  isOpen: boolean;
  item: PreviewItem | null;
  open: (item: PreviewItem) => void;
  close: () => void;
}

export const useQuickInfoStore = create<QuickInfoState>()((set) => ({
  isOpen: false,
  item: null,
  open: (item) => set({ isOpen: true, item }),
  close: () => set({ isOpen: false }),
}));
