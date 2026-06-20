"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import {
  MAX_AVATAR_ZOOM,
  defaultCrop,
  libStateToCrop,
  type AvatarCrop,
} from "@/lib/avatar-crop";

interface AvatarCropperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full image URL (e.g. TMDB w780). */
  src: string;
  /** Source aspect ratio (width / height). */
  aspectRatio: number;
  /** Existing framing when re-editing; null = start centered. */
  initialCrop?: AvatarCrop | null;
  onConfirm: (crop: AvatarCrop) => void;
}

/**
 * Frame any TMDB image into the circular avatar: drag to reposition, pinch /
 * wheel / slider to zoom, with a live circular guide. Built on the reusable
 * `react-zoom-pan-pinch` primitive. Outputs a viewport-normalized `AvatarCrop`
 * (`@/lib/avatar-crop`) reproduced at any size by `UserAvatar`. Responsive:
 * Vaul drawer on mobile (back-button dismiss), dialog on desktop.
 */
export function AvatarCropper({
  open,
  onOpenChange,
  src,
  aspectRatio,
  initialCrop,
  onConfirm,
}: AvatarCropperProps) {
  const isMobile = useMobile();
  useHistoryDismiss(open, () => onOpenChange(false));

  const stage = (
    <CropStage
      src={src}
      aspectRatio={aspectRatio}
      initialCrop={initialCrop ?? null}
      onConfirm={(c) => {
        onConfirm(c);
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle>Frame your avatar</DrawerTitle>
            <DrawerDescription>Drag to reposition · pinch or use the slider to zoom.</DrawerDescription>
          </DrawerHeader>
          {stage}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Frame your avatar</DialogTitle>
          <DialogDescription>Drag to reposition · scroll or use the slider to zoom.</DialogDescription>
        </DialogHeader>
        {stage}
      </DialogContent>
    </Dialog>
  );
}

function CropStage({
  src,
  aspectRatio,
  initialCrop,
  onConfirm,
  onCancel,
}: {
  src: string;
  aspectRatio: number;
  initialCrop: AvatarCrop | null;
  onConfirm: (crop: AvatarCrop) => void;
  onCancel: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [size, setSize] = useState(0);
  const [zoom, setZoom] = useState(initialCrop?.zoom ?? 1);

  // Measure the (square) stage so we can size the cover content + normalize.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setSize(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contentWidth = aspectRatio >= 1 ? size * aspectRatio : size;
  const contentHeight = aspectRatio >= 1 ? size : size / aspectRatio;

  // Keep the viewport-center fixed while the slider changes zoom (keyboard path).
  const applyZoom = useCallback(
    (next: number) => {
      const api = apiRef.current;
      if (!api || size === 0) return;
      const { scale, positionX, positionY } = api.state;
      const cx = (size / 2 - positionX) / scale;
      const cy = (size / 2 - positionY) / scale;
      api.setTransform(size / 2 - next * cx, size / 2 - next * cy, next, 0);
      setZoom(next);
    },
    [size]
  );

  const handleSave = useCallback(() => {
    const api = apiRef.current;
    if (!api || size === 0) return;
    onConfirm(libStateToCrop(api.state, size, aspectRatio));
  }, [aspectRatio, onConfirm, size]);

  const handleReset = useCallback(() => {
    const d = defaultCrop(aspectRatio);
    apiRef.current?.setTransform(d.nx * size, d.ny * size, 1, 200);
    setZoom(1);
  }, [aspectRatio, size]);

  return (
    <div className="space-y-4">
      <div
        ref={stageRef}
        className="relative mx-auto aspect-square w-[min(78vw,320px)] touch-none overflow-hidden rounded-lg bg-black/70"
      >
        {size > 0 && (
          <TransformWrapper
            key={`${size}-${initialCrop ? "edit" : "new"}`}
            ref={apiRef}
            minScale={1}
            maxScale={MAX_AVATAR_ZOOM}
            centerOnInit={!initialCrop}
            initialScale={initialCrop?.zoom ?? 1}
            initialPositionX={initialCrop ? initialCrop.nx * size : undefined}
            initialPositionY={initialCrop ? initialCrop.ny * size : undefined}
            limitToBounds
            doubleClick={{ disabled: true }}
            wheel={{ step: 0.08 }}
            panning={{ velocityDisabled: true }}
            onTransform={(_ref, state) => setZoom(state.scale)}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: contentWidth, height: contentHeight }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
                className="h-full w-full select-none object-cover"
              />
            </TransformComponent>
          </TransformWrapper>
        )}

        {/* Circular guide: ring + dimmed surround so the disc result is obvious. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aspect-square w-full rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/90" />
        </div>
      </div>

      {/* Zoom control — keyboard-accessible (WCAG 1.4.4), mirrors pinch/wheel. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => applyZoom(Math.max(1, +(zoom - 0.2).toFixed(2)))}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={MAX_AVATAR_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-brand"
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => applyZoom(Math.min(MAX_AVATAR_ZOOM, +(zoom + 0.2).toFixed(2)))}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset framing"
          onClick={handleReset}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="h-10 min-w-24" onClick={handleSave}>
          Use photo
        </Button>
      </div>
    </div>
  );
}
