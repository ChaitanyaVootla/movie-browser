"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldOff, VolumeX, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/features/profile/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics } from "@/hooks/use-analytics";
import { getMyBlocks, unblockUser } from "@/server/actions/social";

interface BlockedRow {
  id: number;
  type: "BLOCK" | "MUTE";
  blocked: {
    id: number;
    username: string | null;
    name: string | null;
    image: string | null;
  };
}

/**
 * Settings management for the viewer's blocked/muted users. Lists every
 * outbound block/mute and lets the viewer lift each one. Loaded client-side
 * (the data is viewer-private and the list is small).
 */
export function BlockedUsersSettings() {
  const { trackAction } = useAnalytics();
  const [rows, setRows] = useState<BlockedRow[] | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyBlocks()
      .then((result) => {
        if (cancelled) return;
        setRows(result.success ? (result.blocks as BlockedRow[]) : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = async (row: BlockedRow) => {
    setPendingId(row.blocked.id);
    try {
      const result = await unblockUser({ userId: row.blocked.id });
      if (!result.success) throw new Error(result.error);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
      trackAction({
        action: "unblock_user",
        metadata: { username: row.blocked.username ?? String(row.blocked.id) },
      });
    } catch {
      toast.error("Couldn't update");
    } finally {
      setPendingId(null);
    }
  };

  if (rows === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium text-muted-foreground">
          You haven&apos;t blocked or muted anyone.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const label = row.blocked.name ?? row.blocked.username ?? "User";
        const isPending = pendingId === row.blocked.id;
        return (
          <li
            key={row.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <UserAvatar
              src={row.blocked.image}
              name={label}
              className="size-10"
              fallbackClassName="text-sm"
            />

            <div className="min-w-0 flex-1">
              {row.blocked.username ? (
                <Link
                  href={`/u/${row.blocked.username}`}
                  prefetch={false}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {label}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium">{label}</span>
              )}
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {row.type === "BLOCK" ? (
                  <>
                    <ShieldOff className="h-3 w-3" /> Blocked
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3 w-3" /> Muted
                  </>
                )}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => void handleRemove(row)}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : row.type === "BLOCK" ? (
                "Unblock"
              ) : (
                "Unmute"
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
