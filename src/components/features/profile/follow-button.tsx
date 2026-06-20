"use client";

import { useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoginDialog } from "@/components/features/auth";
import { useAnalytics } from "@/hooks/use-analytics";
import { followAction } from "@/server/actions/profile";
import { useProfileViewer } from "./profile-viewer-context";
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
  const { resolved, authenticated, isOwner, isFollowing, setIsFollowing } = useProfileViewer();
  const { openLoginDialog } = useLoginDialog();
  const { trackAction } = useAnalytics();
  const [busy, setBusy] = useState(false);

  if (!resolved) {
    return <Skeleton className={cn("h-10 w-28 rounded-full bg-white/10", className)} />;
  }
  if (isOwner) return null;

  const handleClick = async () => {
    if (!authenticated) {
      openLoginDialog();
      return;
    }
    const next = !isFollowing;
    setBusy(true);
    setIsFollowing(next); // optimistic
    try {
      const result = await followAction({ username, follow: next });
      if (!result.ok) throw new Error(result.error);
      trackAction({ action: next ? "follow" : "unfollow", metadata: { username } });
    } catch {
      setIsFollowing(!next);
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
        isFollowing
          ? "bg-white/15 text-white border border-white/30 backdrop-blur-sm hover:bg-white/25"
          : "bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm",
        className
      )}
      disabled={busy}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFollowing ? (
        <Check className="h-4 w-4 stroke-[2.5]" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
