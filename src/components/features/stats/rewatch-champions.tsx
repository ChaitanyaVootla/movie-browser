import { Flame, Repeat } from "lucide-react";
import type { RewatchChampionDTO } from "@/types/social";

export function StreaksRow({
  current,
  longest,
}: {
  current: number;
  longest: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Flame className="h-6 w-6 text-brand" />
        <div>
          <p className="text-xl font-semibold tracking-tight">{current} days</p>
          <p className="text-xs font-medium text-muted-foreground">Current streak</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Flame className="h-6 w-6 text-muted-foreground" />
        <div>
          <p className="text-xl font-semibold tracking-tight">{longest} days</p>
          <p className="text-xs font-medium text-muted-foreground">Longest streak</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Rewatch champions. The v1 DTO is text-only ({ title, count } — no
 * poster/ids, per Task 1 relaxed-DTO note), so render compact text rows.
 */
export function RewatchChampions({ champions }: { champions: RewatchChampionDTO[] }) {
  if (champions.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card divide-y divide-border/50">
      {champions.map((item) => (
        <div key={item.title} className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
          <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
            <Repeat className="h-3 w-3" /> {item.count}×
          </span>
        </div>
      ))}
    </div>
  );
}
