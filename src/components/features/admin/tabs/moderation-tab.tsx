"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ModAuthor {
  id: number;
  username: string | null;
  name: string | null;
}
interface ModComment {
  id: number;
  body: string;
  status: string;
  spoilerScope: string;
  aiLabels: Record<string, unknown> | null;
  createdAt: string;
  user: ModAuthor | null;
}
interface ModReport {
  id: number;
  reason: string;
  note: string | null;
  createdAt: string;
  reporter: { id: number; username: string | null } | null;
  comment: ModComment | null;
}

async function postAction(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/admin/moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

function CommentRow({ comment, onDone }: { comment: ModComment; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: "approve" | "remove") => {
    setBusy(true);
    const ok = await postAction({ action, commentId: comment.id });
    setBusy(false);
    if (ok) {
      toast.success(action === "approve" ? "Published" : "Removed");
      onDone();
    } else toast.error("Action failed");
  };
  const gateLabels = comment.aiLabels ? JSON.stringify(comment.aiLabels) : null;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <Badge variant="outline">{comment.status}</Badge>
        <Badge variant="outline">{comment.spoilerScope}</Badge>
        <span>{comment.user?.username ?? comment.user?.name ?? "unknown"}</span>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
      {gateLabels && (
        <p className="text-[11px] text-muted-foreground font-mono break-all line-clamp-2">
          {gateLabels}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void act("approve")}>
          <Check className="h-3.5 w-3.5 mr-1" /> Publish
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void act("remove")}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
        </Button>
      </div>
    </div>
  );
}

export function ModerationTab() {
  const [comments, setComments] = useState<ModComment[]>([]);
  const [reports, setReports] = useState<ModReport[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [queueRes, reportsRes] = await Promise.all([
      fetch("/api/admin/moderation?view=queue"),
      fetch("/api/admin/moderation?view=reports"),
    ]);
    if (queueRes.ok) setComments(((await queueRes.json()) as { comments: ModComment[] }).comments);
    if (reportsRes.ok) setReports(((await reportsRes.json()) as { reports: ModReport[] }).reports);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolveReport = async (reportId: number, resolution: "RESOLVED" | "DISMISSED") => {
    const ok = await postAction({ action: "resolve_report", reportId, resolution });
    if (ok) {
      toast.success("Report updated");
      void refresh();
    } else toast.error("Action failed");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Review queue ({comments.length})</h2>
        {comments.length === 0 && <p className="text-sm text-muted-foreground">Queue is empty.</p>}
        {comments.map((c) => (
          <CommentRow key={c.id} comment={c} onDone={() => void refresh()} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open reports ({reports.length})</h2>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">No open reports.</p>}
        {reports.map((r) => (
          <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <Badge>{r.reason}</Badge>
              <span>by {r.reporter?.username ?? "unknown"}</span>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.note && <p className="text-xs text-muted-foreground italic">&quot;{r.note}&quot;</p>}
            {r.comment ? (
              <CommentRow comment={r.comment} onDone={() => void refresh()} />
            ) : (
              <p className="text-xs text-muted-foreground">Reported content unavailable</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void resolveReport(r.id, "RESOLVED")}>
                <Check className="h-3.5 w-3.5 mr-1" /> Resolved
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void resolveReport(r.id, "DISMISSED")}>
                <X className="h-3.5 w-3.5 mr-1" /> Dismiss
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
