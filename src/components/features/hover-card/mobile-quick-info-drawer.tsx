"use client";

import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useQuickInfoStore } from "./quick-info-store";
import { usePreviewData } from "./use-preview-data";
import { LazyPreviewBody as PreviewBody, PreviewChunkBoundary } from "./lazy-preview-body";

/**
 * Touch long-press → Vaul quick-info drawer (spec 2026-10-09 D4). It renders the
 * SAME `PreviewBody` + `TitleActions` as the desktop hover preview. The ~250
 * duplicated lines that used to live here are gone.
 *
 * Back closes it (`useHistoryDismiss`, which also releases the stranded
 * body pointer-events lock and flushes the Vaul exit; see pwa-mobile.md).
 * A navigation from inside it closes it once the route changes.
 */
export function MobileQuickInfoDrawer() {
  const isOpen = useQuickInfoStore((s) => s.isOpen);
  const item = useQuickInfoStore((s) => s.item);
  const close = useQuickInfoStore((s) => s.close);
  const titleId = useId();
  const isMovie = item ? "title" in item : true;
  const { state, retry } = usePreviewData(item ? item.id : null, isMovie ? "movie" : "series");

  useHistoryDismiss(isOpen, close);

  // Close once a navigation started inside the drawer completes. Deferred a
  // tick so the destination paints before the drawer slides away.
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    const timer = setTimeout(() => {
      if (useQuickInfoStore.getState().isOpen) close();
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname, close]);

  const title = item ? ("title" in item ? item.title : item.name) : "";

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && close()}>
      <DrawerContent className="max-h-[90dvh] border-border bg-popover">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{title || "Quick info"}</DrawerTitle>
        </DrawerHeader>
        <DrawerClose asChild>
          <button
            type="button"
            className="absolute right-3 top-5 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </DrawerClose>
        <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
          {item && (
            <PreviewChunkBoundary
              key={`${isMovie ? "m" : "s"}${item.id}`}
              item={item}
              onClose={close}
            >
              <PreviewBody
                item={item}
                state={state}
                onRetry={retry}
                variant="drawer"
                titleId={titleId}
              />
            </PreviewChunkBoundary>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
