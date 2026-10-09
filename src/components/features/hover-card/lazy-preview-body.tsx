"use client";

import dynamic from "next/dynamic";

/**
 * `PreviewBody` (and with it TitleActions → SaveButton/RateButton/QuickLog/
 * LoginDialog/list picker) is loaded on demand. The overlay and drawer are
 * mounted by the ROOT Providers, so a static import would put the whole action
 * stack into the entry JS of every route, including pages with no cards
 * (performance.md item 15). The card wrapper preloads the chunk at hover-warm
 * time (200ms) or on touch-down, so it is normally ready before the preview
 * opens. The overlay stays hidden until the body has height.
 */
let loader: Promise<typeof import("./preview-body")> | null = null;
export function preloadPreviewBody() {
  loader ??= import("./preview-body");
  return loader;
}

export const LazyPreviewBody = dynamic(() => preloadPreviewBody().then((mod) => mod.PreviewBody), {
  ssr: false,
  loading: () => null,
});
