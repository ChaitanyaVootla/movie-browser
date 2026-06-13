"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { followAction, getProfileViewerState } from "@/server/actions/profile";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  username: string;
  className?: string;
}

/**
 * Follow/unfollow island. The profile page is ISR-cached, so follow state is
 * NEVER in server HTML — it hydrates here per viewer (§4.1.8).
 * Styled for placement over hero imagery (hardcoded white is correct there).
 */
export function FollowButton({ username, className }: FollowButtonProps) {
  const { status } = useSession();
  const { openLoginDialog } = useLoginDialog();
  const { trackAction } = useAnalytics();
  const [state, setState] = useState<{ isOwner: boolean; isFollowing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setState({ isOwner: false, isFollowing: false });
      return;
    }
    let cancelled = false;
    getProfileViewerState(username)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ isOwner: false, isFollowing: false });
      });
    return () => {
      cancelled = true;
    };
  }, [status, username]);

  if (state === null) {
    return <Skeleton className={cn("h-10 w-28 rounded-full bg-white/10", className)} />;
  }
  if (state.isOwner) return null;

  const handleClick = async () => {
    if (status !== "authenticated") {
      openLoginDialog();
      return;
    }
    const next = !state.isFollowing;
    setBusy(true);
    setState({ ...state, isFollowing: next }); // optimistic
    try {
      const result = await followAction({ username, follow: next });
      if (!result.ok) throw new Error(result.error);
      trackAction({ action: next ? "follow" : "unfollow", metadata: { username } });
    } catch {
      setState({ ...state, isFollowing: !next });
      toast.error("Couldn't update follow");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      className={cn(
        "h-10 gap-1.5 rounded-full font-semibold transition-all",
        state.isFollowing
          ? "bg-brand/40 text-white border-2 border-brand/70 hover:bg-brand/50"
          : "bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm",
        className
      )}
      disabled={busy}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state.isFollowing ? (
        <Check className="h-4 w-4 stroke-[2.5]" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {state.isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
