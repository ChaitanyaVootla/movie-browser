import type { ReactNode } from "react";
import { CountUp } from "@/components/features/stats/count-up";
import { cn } from "@/lib/utils";

/** Bordered widget surface with an optional titled header. */
export function WidgetCard({
  title,
  icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex h-full flex-col overflow-hidden rounded-xl border bg-card p-4", className)}>
      {title && (
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          {icon && <span className="text-brand">{icon}</span>}
          <span className="truncate">{title}</span>
          {action && <span className="ml-auto">{action}</span>}
        </div>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Single big-number stat tile (count-up). */
export function StatTile({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border bg-card p-3 transition-colors hover:border-brand/40">
      <span className="text-brand">{icon}</span>
      <div className="mt-2">
        <CountUp value={value} className="block text-xl font-bold leading-none tracking-tight tabular-nums md:text-2xl" />
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
