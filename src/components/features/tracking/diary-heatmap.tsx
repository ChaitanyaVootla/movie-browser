import { cn } from "@/lib/utils";

/**
 * GitHub-style daily watch heatmap for the Diary header. Last ~26 weeks of
 * dated entries, column-major (each column = one Sun→Sat week). Mirrors the
 * profile "Watch activity" widget's visual language (same 5-step brand ramp).
 * Server-rendered, no interactivity; horizontally scrollable on narrow screens.
 */

const DAY = 86_400_000;
const WEEKS = 26;
// 5 intensity steps — static class strings so Tailwind keeps them.
const LEVELS = ["bg-foreground/[0.06]", "bg-brand/30", "bg-brand/55", "bg-brand/80", "bg-brand"];
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 3) return 3;
  return 4;
}

interface DiaryHeatmapProps {
  /** Sparse {date: "YYYY-MM-DD", count} list (only days with activity). */
  dailyActivity: { date: string; count: number }[];
}

export function DiaryHeatmap({ dailyActivity }: DiaryHeatmapProps) {
  const counts = new Map(dailyActivity.map((d) => [d.date, d.count]));

  // Build a ~26-week window aligned so each column is a Sun→Sat week.
  const now = new Date();
  const todayMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startApprox = todayMid - (WEEKS * 7 - 1) * DAY;
  const gridStart = startApprox - new Date(startApprox).getUTCDay() * DAY;

  const cells: { key: string; count: number; date: Date }[] = [];
  for (let t = gridStart; t <= todayMid; t += DAY) {
    const date = new Date(t);
    const key = date.toISOString().slice(0, 10);
    cells.push({ key, count: counts.get(key) ?? 0, date });
  }

  // Month labels: one per column where the month changes (column = first cell of week).
  const columns = Math.ceil(cells.length / 7);
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < columns; col++) {
    const first = cells[col * 7];
    if (!first) continue;
    const m = first.date.getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col, label: MONTH_FMT.format(first.date) });
      lastMonth = m;
    }
  }

  return (
    <div className="overflow-x-auto scrollbar-hide" aria-hidden>
      <div className="inline-flex flex-col gap-1">
        <div
          className="grid gap-[3px] text-[10px] font-medium text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${columns}, 11px)` }}
        >
          {monthLabels.map((m) => (
            <span key={m.col} className="whitespace-nowrap" style={{ gridColumnStart: m.col + 1 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
          {cells.map((c) => (
            <div
              key={c.key}
              title={`${c.key}: ${c.count} ${c.count === 1 ? "entry" : "entries"}`}
              className={cn("size-[11px] rounded-[2px]", LEVELS[level(c.count)])}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
