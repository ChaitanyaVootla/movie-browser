"use client";

/**
 * Cold-start calibration deck (taste v2 spec 2026-10-12 §3.6): rate ~10 known
 * titles; picks appear once 3 positives land. Also hosted by the profile owner
 * hint (workstream B) — import it via `next/dynamic`, it is never above the fold.
 *
 * stub — implemented by workstream A. The props are the contract.
 */
import type { CalibrationMode } from "@/lib/taste/recommend-types";

export interface TasteCalibrationDeckProps {
  /** "start" = cold start; "sharpen" = warm user, mid-relevance candidates. */
  mode: CalibrationMode;
  onProgress?: (p: { answered: number; positives: number }) => void;
  /** `ready` = enough positives for the For-you row. */
  onComplete?: (r: { positives: number; ready: boolean }) => void;
  className?: string;
}

export function TasteCalibrationDeck(_props: TasteCalibrationDeckProps) {
  return null;
}
