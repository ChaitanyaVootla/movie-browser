"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  getNotificationFeed,
  markAllNotificationsRead,
  type NotificationDto,
} from "@/server/actions/notifications";
import { cn } from "@/lib/utils";
import { describeNotification } from "./describe";

export function NotificationList() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { state: pushState, subscribe, unsubscribe } = usePushSubscription();
  const { trackAction } = useAnalytics();

  const loadInitial = useCallback(() => {
    setLoading(true);
    setError(false);
    getNotificationFeed({ cursor: null, limit: 20 })
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        // Mark read AFTER the unread state has been captured for display
        void markAllNotificationsRead();
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await getNotificationFeed({ cursor, limit: 20 });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = () => {
    trackAction({ action: "push_enable" });
    void subscribe();
  };

  const handleUnsubscribe = () => {
    trackAction({ action: "push_disable" });
    void unsubscribe();
  };

  return (
    <div className="space-y-4">
      {/* Push toggle */}
      {pushState !== "unsupported" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="text-sm">
            <p className="font-medium">Push notifications</p>
            <p className="text-muted-foreground text-xs">
              Get notified about replies and mentions
            </p>
          </div>
          {pushState === "subscribed" ? (
            <Button variant="outline" size="sm" className="min-h-10" onClick={handleUnsubscribe}>
              <BellOff className="h-4 w-4 mr-1.5" /> Disable
            </Button>
          ) : (
            <Button
              size="sm"
              className="min-h-10"
              disabled={pushState === "loading" || pushState === "denied"}
              onClick={handleSubscribe}
            >
              <BellRing className="h-4 w-4 mr-1.5" />
              {pushState === "denied" ? "Blocked in browser" : "Enable"}
            </Button>
          )}
        </div>
      )}

      {loading && items.length === 0 && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load notifications.</p>
          <Button variant="outline" size="sm" className="min-h-10" onClick={loadInitial}>
            Try again
          </Button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nothing yet. Replies and mentions land here.
        </p>
      )}

      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.payload.url ?? "/notifications"}
              className={cn(
                "block py-3 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors",
                !n.read && "bg-muted/30"
              )}
            >
              <p className="text-sm">{describeNotification(n)}</p>
              {n.payload.snippet && !n.payload.spoilery && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {n.payload.snippet}
                </p>
              )}
              {n.payload.spoilery && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  Spoiler-tagged comment — open to view
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {cursor && (
        <Button
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
        </Button>
      )}
    </div>
  );
}
