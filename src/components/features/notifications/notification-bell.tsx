"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSession } from "next-auth/react";
import { getUnreadNotificationCount } from "@/server/actions/notifications";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";

/** Bell + unread badge. Fetches on mount and when the tab regains focus. */
export function NotificationBell({ className }: { className?: string }) {
  const { status } = useSession();
  const { trackAction } = useAnalytics();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const refresh = () => {
      void getUnreadNotificationCount().then((n) => {
        if (!cancelled) setUnread(n);
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status]);

  if (status !== "authenticated") return null;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      onClick={() => trackAction({ action: "notification_open", metadata: { unread } })}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted transition-colors",
        className
      )}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-brand-foreground text-[10px] font-semibold leading-4 text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
