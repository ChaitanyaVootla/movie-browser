"use client";

/**
 * Viewer-gated taste islands, loaded on demand. Most `/u/*` visitors are
 * signed out, so the match card (signed-in non-owners) and the owner hint
 * (owner only) are split out of the page's entry JS and fetched only once
 * the viewer context says they can render.
 */
import dynamic from "next/dynamic";
import type { TasteHintState } from "@/types/social";
import { useProfileViewer } from "./profile-viewer-context";

const TasteMatch = dynamic(() => import("./taste-match").then((m) => m.TasteMatch), { ssr: false });
const TasteOwnerHint = dynamic(() => import("./taste-owner-hint").then((m) => m.TasteOwnerHint), { ssr: false });

export function TasteMatchSlot(props: { username: string; displayName: string }) {
  const { resolved, authenticated, isOwner } = useProfileViewer();
  if (!resolved || !authenticated || isOwner) return null;
  return <TasteMatch {...props} />;
}

export function TasteOwnerHintSlot({ taste }: { taste: TasteHintState | null }) {
  const { resolved, isOwner } = useProfileViewer();
  if (!resolved || !isOwner || !taste || taste.status === "ready") return null;
  return <TasteOwnerHint taste={taste} />;
}
