import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { WidgetCard } from "./widget-card";
import { cn, getMediaPath } from "@/lib/utils";
import type { ProfileWidgetData } from "./types";

/**
 * "Watch activity" — a GitHub-style daily heatmap (last ~26 weeks, public
 * dated watches) on the left, and a compact list of the most-recent watched
 * titles (linked) on the right. Server-rendered. (A true recent-activity FEED
 * — watches + reviews + lists — is a planned follow-up; see the spec §9.)
 */

const DAY = 86_400_000;
const WEEKS = 26;
// 5 intensity steps (static class strings so Tailwind keeps them).
const LEVELS = ["bg-foreground/[0.06]", "bg-brand/30", "bg-brand/55", "bg-brand/80", "bg-brand"];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 3) return 3;
  return 4;
}

export function WatchActivityWidget({ data }: { data: ProfileWidgetData }) {
  const counts = new Map(data.dailyActivity.map((d) => [d.day, d.count]));

  // Build the cell range: ~26 weeks back, aligned so each column is a week
  // (Sun→Sat) — grid-flow-col + grid-rows-7 fills column-major in DOM order.
  const now = new Date();
  const todayMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startApprox = todayMid - (WEEKS * 7 - 1) * DAY;
  const gridStart = startApprox - new Date(startApprox).getUTCDay() * DAY;

  const cells: { key: string; count: number }[] = [];
  for (let t = gridStart; t <= todayMid; t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    cells.push({ key, count: counts.get(key) ?? 0 });
  }

  return (
    <WidgetCard title="Watch activity" icon={<CalendarRange className="h-4 w-4" />}>
      <div className="flex h-full gap-3">
        {/* Heatmap */}
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((c) => (
              <div
                key={c.key}
                title={`${c.key}: ${c.count} watch${c.count === 1 ? "" : "es"}`}
                className={cn("size-[9px] rounded-[2px]", LEVELS[level(c.count)])}
              />
            ))}
          </div>
        </div>

        {/* Recent titles */}
        {data.recentWatches.length > 0 && (
          <ul className="flex w-32 flex-shrink-0 flex-col gap-1.5 border-l border-border/60 pl-3">
            {data.recentWatches.slice(0, 6).map((w, i) => (
              <li key={`${w.mediaType}-${w.tmdbId}-${i}`} className="min-w-0">
                <Link
                  href={getMediaPath(w.mediaType, w.tmdbId, w.title)}
                  prefetch={false}
                  className="block truncate text-xs font-medium hover:text-brand"
                >
                  {w.title}
                </Link>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(w.watchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WidgetCard>
  );
}
