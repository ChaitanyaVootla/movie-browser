import { cn } from "@/lib/utils";

/**
 * Pure CSS/SVG chart primitives — server-rendered, zero JS, theme-token
 * colors. Decision: recharts (already a dep, admin-only) is client-only and
 * heavy; these stay RSC.
 */

interface MonthlyDatum {
  month: string; // "2026-06"
  /** Combined movie+episode watch count (relaxed DTO — see Task 1 note). */
  count: number;
}

export function MonthlyBarChart({ data }: { data: MonthlyDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5">
        {data.map((d) => (
          <div
            key={d.month}
            className="flex flex-1 flex-col justify-end"
            title={`${d.month}: ${d.count} watches`}
          >
            <div
              className="rounded-t-sm bg-brand"
              style={{ height: `${(d.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span key={d.month} className="flex-1 text-center text-[10px] font-medium text-muted-foreground">
            {new Date(`${d.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

interface BreakdownDatum {
  label: string;
  count: number;
}

export function BreakdownBars({
  data,
  className,
}: {
  data: BreakdownDatum[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className={cn("space-y-2", className)}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-24 flex-shrink-0 truncate text-xs font-medium text-muted-foreground">
            {d.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 flex-shrink-0 text-right text-xs font-medium">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export function Histogram({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div>
      <div className="flex h-20 items-end gap-1">
        {counts.map((count, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-brand/70"
            style={{ height: `${Math.max(2, (count / max) * 100)}%` }}
            title={`${count} rated ${i + 1}/10`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-muted-foreground">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}
