"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useUsername } from "@/hooks/use-username";

// Owner-only + client-only: lazy so the fresh-data body never enters the
// visitor bundle — visitors keep the cached, server-rendered body (`children`).
const OwnerListBody = dynamic(
  () => import("./owner-list-body").then((m) => m.OwnerListBody),
  { ssr: false }
);

/**
 * Visitors — and the owner until their relationship resolves — get `children`:
 * the server-rendered, CDN-cached body (public item grid, or a generic "private"
 * placeholder for a private list). Once resolved as the owner, swap to the
 * client `OwnerListBody`, which renders the whole list from fresh, uncached
 * `getList` data — so the owner sees their latest edits AND can view a private
 * list whose content is deliberately absent from the cached HTML. Mirrors
 * `ProfileBodySwitch`.
 */
export function ListOwnerSwitch({
  listId,
  ownerUsername,
  children,
}: {
  listId: number;
  ownerUsername: string;
  children: ReactNode;
}) {
  const { status } = useSession();
  const { username, loading } = useUsername();
  const isOwner =
    status === "authenticated" &&
    !loading &&
    username != null &&
    username.toLowerCase() === ownerUsername.toLowerCase();

  if (isOwner) return <OwnerListBody listId={listId} ownerUsername={ownerUsername} />;
  return <>{children}</>;
}
