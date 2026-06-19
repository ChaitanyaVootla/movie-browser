"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HubThreadCard } from "./hub-thread-card";
import { AudienceFilterSlot } from "@/components/features/discussion/audience-filter-slot";
import {
  getHubFollowing,
  type HubTab,
} from "@/server/actions/discussions-hub";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";
import type { CommentCursor } from "@/server/services/discussion/comment-schemas";

const TABS: { id: HubTab; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "following", label: "Following" },
];

export function HubTabs({ initialHot, initialNew }: { initialHot: Card[]; initialNew: Card[] }) {
  const [tab, setTab] = useState<HubTab>("hot");
  const [following, setFollowing] = useState<Card[] | null>(null);
  const [followingCursor, setFollowingCursor] = useState<CommentCursor | null>(null);
  const [loading, setLoading] = useState(false);

  const selectTab = async (next: HubTab) => {
    setTab(next);
    if (next === "following" && following === null) {
      setLoading(true);
      const page = await getHubFollowing({ cursor: null });
      setFollowing(page.cards);
      setFollowingCursor(page.nextCursor);
      setLoading(false);
    }
  };

  const cards = tab === "hot" ? initialHot : tab === "new" ? initialNew : (following ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => void selectTab(t.id)}
              className={cn(
                "min-h-[40px] rounded-md px-3 text-sm font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AudienceFilterSlot />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "following" ? "Follow people or track shows to see their discussions here." : "No discussions yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => (
            <HubThreadCard key={c.id} card={c} />
          ))}
        </div>
      )}

      {tab === "following" && followingCursor ? (
        <div className="text-center">
          <button
            className="min-h-[40px] rounded-md border border-border px-4 text-sm"
            onClick={async () => {
              const page = await getHubFollowing({ cursor: followingCursor });
              setFollowing((prev) => [...(prev ?? []), ...page.cards]);
              setFollowingCursor(page.nextCursor);
            }}
          >
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
