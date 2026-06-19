import { Lock } from "lucide-react";

export function LockedTeaser({
  count,
  mediaType,
}: {
  count: number;
  mediaType: "movie" | "series";
}) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3">
      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{count}</span>{" "}
        {count === 1 ? "comment unlocks" : "comments unlock"} as you{" "}
        {mediaType === "movie"
          ? "watch — mark it watched to join in"
          : "watch — log your progress to join in"}
        .
      </p>
    </div>
  );
}
