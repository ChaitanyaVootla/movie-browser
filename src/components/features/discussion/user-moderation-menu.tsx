"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { MoreHorizontal, Shield, ShieldOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  blockUser,
  getProfileModerationState,
  unblockUser,
} from "@/server/actions/social";

type ModState = "BLOCK" | "MUTE" | null;

/**
 * Block / mute control for another user's profile. Mounts next to the follow
 * button over the hero (hardcoded white styling is correct over imagery,
 * matching FollowButton — DESIGN.md Colors exception).
 *
 * Resolves state client-side by username so the ISR-cached profile HTML never
 * embeds per-viewer block state (roadmap §4.1.8). Renders nothing for signed-out
 * viewers, the owner's own profile, or an unresolvable username.
 */
export function UserModerationMenu({ username }: { username: string }) {
  const { status } = useSession();
  const { trackAction } = useAnalytics();
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [state, setState] = useState<ModState>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getProfileModerationState(username)
      .then((data) => {
        if (cancelled) return;
        setTargetUserId(data.targetUserId);
        setIsOwner(data.isOwner);
        setState(data.blockState);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, username]);

  if (status !== "authenticated" || isOwner || targetUserId === null) return null;

  const apply = async (next: ModState) => {
    if (busy) return;
    setBusy(true);
    const previous = state;
    setState(next); // optimistic
    try {
      const result = next
        ? await blockUser({ userId: targetUserId, type: next })
        : await unblockUser({ userId: targetUserId });
      if (!result.success) throw new Error(result.error);
      trackAction({
        action: next === "BLOCK" ? "block_user" : next === "MUTE" ? "mute_user" : "unblock_user",
        metadata: { username },
      });
      toast.success(
        next === "BLOCK"
          ? "User blocked"
          : next === "MUTE"
            ? "User muted"
            : "Restrictions removed"
      );
    } catch {
      setState(previous); // revert
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          disabled={busy}
          aria-label="User options"
          className="h-10 w-10 rounded-full p-0 bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {state === null && (
          <DropdownMenuItem onClick={() => void apply("MUTE")}>
            <VolumeX className="mr-2 h-4 w-4" /> Mute (hide their comments)
          </DropdownMenuItem>
        )}
        {state === "MUTE" && (
          <DropdownMenuItem onClick={() => void apply(null)}>
            <Volume2 className="mr-2 h-4 w-4" /> Unmute
          </DropdownMenuItem>
        )}
        {state !== "BLOCK" ? (
          <DropdownMenuItem onClick={() => void apply("BLOCK")}>
            <Shield className="mr-2 h-4 w-4" /> Block (mutual invisibility)
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void apply(null)}>
            <ShieldOff className="mr-2 h-4 w-4" /> Unblock
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
