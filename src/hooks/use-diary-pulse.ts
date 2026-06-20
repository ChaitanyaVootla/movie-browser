"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackedMediaType } from "@/types/social";

/**
 * A lightweight cross-component signal: any place that creates/updates a diary
 * entry (movie Watched toggle, series progress update, the Diary panel itself)
 * emits this, and the per-title Diary button pulses so the user notices they
 * can open it to log more / annotate. Decoupled via a window event so it works
 * regardless of where in the tree the mutation happened (movie watched button,
 * series progress control in the action slot, etc.).
 */
const DIARY_UPDATED_EVENT = "mb:diary-updated";

interface DiaryUpdatedDetail {
  mediaType: TrackedMediaType;
  tmdbId: number;
}

export function emitDiaryUpdated(mediaType: TrackedMediaType, tmdbId: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DiaryUpdatedDetail>(DIARY_UPDATED_EVENT, { detail: { mediaType, tmdbId } })
  );
}

/**
 * Fires `onUpdate` whenever a diary-updated event targets this (mediaType,
 * tmdbId) — event-driven, so the callback may set state without tripping the
 * synchronous-setState-in-effect rule. `onUpdate` is read from a ref so the
 * subscription is stable across renders.
 */
export function useDiaryUpdated(
  mediaType: TrackedMediaType,
  tmdbId: number,
  onUpdate: () => void
): void {
  const cbRef = useRef(onUpdate);
  useEffect(() => {
    cbRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DiaryUpdatedDetail>).detail;
      if (detail?.mediaType === mediaType && detail?.tmdbId === tmdbId) cbRef.current();
    };
    window.addEventListener(DIARY_UPDATED_EVENT, handler);
    return () => window.removeEventListener(DIARY_UPDATED_EVENT, handler);
  }, [mediaType, tmdbId]);
}

/** Returns true for ~2s after a matching diary-updated event fires. */
export function useDiaryPulse(mediaType: TrackedMediaType, tmdbId: number): boolean {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DiaryUpdatedDetail>).detail;
      if (detail?.mediaType === mediaType && detail?.tmdbId === tmdbId) {
        setPulse(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setPulse(false), 2200);
      }
    };
    window.addEventListener(DIARY_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(DIARY_UPDATED_EVENT, handler);
      if (timer) clearTimeout(timer);
    };
  }, [mediaType, tmdbId]);
  return pulse;
}
