"use client";

/**
 * Mirrors the Tune bar's tokens to `/?tune=` (performance.md §18 pattern): the
 * ONLY component in the home tree that reads search params, rendered inside
 * its own `<Suspense>` so the ISR home shell never bails out of static
 * rendering. Writes go through `useUrlState` (replaceState — no history entry,
 * no RSC round-trip); Back INTO `/` restores the tune from the URL.
 */
import { useEffect, useRef } from "react";
import { useUrlState } from "@/hooks/use-url-state";
import { TUNE_URL_KEY } from "@/lib/taste/recommend-types";
import { parseTuneString } from "@/lib/taste/tune-tokens";

export function TuneUrlSync({ tokens, onUrlTokens }: { tokens: readonly string[]; onUrlTokens: (t: string[]) => void }) {
  const { get, set } = useUrlState();
  const urlValue = get(TUNE_URL_KEY) ?? "";
  /** Last value both sides agreed on (null until the first URL read). */
  const synced = useRef<string | null>(null);
  const onUrl = useRef(onUrlTokens);
  useEffect(() => {
    onUrl.current = onUrlTokens;
  });

  // URL → state (first read, and Back/forward or an external write).
  useEffect(() => {
    if (urlValue === synced.current) return;
    synced.current = urlValue;
    onUrl.current(parseTuneString(urlValue));
  }, [urlValue]);

  // State → URL (chip presses, Cue tune, reset).
  const joined = tokens.join(",");
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (synced.current === null || joined === synced.current) return;
    synced.current = joined;
    set({ [TUNE_URL_KEY]: joined || null });
  }, [joined, set]);

  return null;
}
