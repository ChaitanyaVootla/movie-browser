"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeThread } from "@/server/actions/thread-summary";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import { useAnalytics } from "@/hooks/use-analytics";

export function ThreadSummaryCard({ anchor }: { anchor: DiscussionAnchor }) {
  const { status } = useSession();
  const { trackAction } = useAnalytics();
  const [summary, setSummary] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  if (status !== "authenticated") return null;

  const generate = async () => {
    setState("loading");
    trackAction({
      action: "thread_summarize",
      mediaType: anchor.type,
      itemId: anchor.type === "movie" ? anchor.movieId : anchor.seriesId,
    });
    const result = await summarizeThread({ anchor });
    if (result.status === "ok") {
      setSummary(result.summary);
      setCount(result.commentCount);
      setState("idle");
    } else {
      setState(result.status === "not_enough_comments" ? "empty" : "error");
    }
  };

  if (summary) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Thread summary · safe to your progress
        </p>
        <p className="text-sm text-foreground/90 leading-relaxed">{summary}</p>
        <p className="text-[11px] text-muted-foreground">
          AI summary of the {count} comments visible at your watch progress.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={state === "loading"}
        onClick={() => void generate()}
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
        )}
        Summarize discussion
      </Button>
      {state === "empty" && (
        <span className="text-xs text-muted-foreground">
          Not enough comments to summarize yet.
        </span>
      )}
      {state === "error" && (
        <span className="text-xs text-muted-foreground">Couldn&apos;t summarize right now.</span>
      )}
    </div>
  );
}
