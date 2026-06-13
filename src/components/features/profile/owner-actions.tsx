"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getProfileViewerState } from "@/server/actions/profile";

/** Owner-only "Edit profile" affordance — client-resolved (cache-safe). */
export function OwnerActions({ username }: { username: string }) {
  const { status } = useSession();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getProfileViewerState(username)
      .then((state) => {
        if (!cancelled) setIsOwner(state.isOwner);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, username]);

  if (!isOwner) return null;

  return (
    <Button
      asChild
      size="sm"
      variant="secondary"
      className="h-10 gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm"
    >
      <Link href="/settings">
        <Pencil className="h-3.5 w-3.5" /> Edit profile
      </Link>
    </Button>
  );
}
