"use client";

/**
 * Eager, tiny slot for Cue's `[TUNE:…]` pill. The pill (and the tune-token
 * converter it needs) is fetched only when a reply actually carries a tag —
 * the chat lives in the root layout, so anything imported eagerly here ships
 * on every route (performance.md §15).
 */
import dynamic from "next/dynamic";
import { useState } from "react";

const TunePill = dynamic(() => import("./tune-pill").then((m) => m.TunePill), { ssr: false });

export function TuneTagSlot({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  // "Live" = this reply streamed while the view was mounted. Derived during
  // render (not in an effect) so a reply that finishes before the pill chunk
  // loads still counts as live.
  const [live, setLive] = useState(isStreaming);
  if (isStreaming && !live) setLive(true);
  if (!content.includes("[TUNE:")) return null;
  return <TunePill content={content} live={live} />;
}
