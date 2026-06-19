"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProgressBorderPillProps {
  /** 0–100. The fraction of the pill's outline drawn in the brand accent. */
  percent: number;
  children: ReactNode;
  strokeWidth?: number;
  className?: string;
}

/**
 * A pill whose BORDER is a progress track: the full outline is a faint
 * foreground tint and the "watched" fraction is drawn in brand. The size is
 * measured from the content so the stroke traces the real rounded-rect (works
 * for any label width). Used to fuse the status label and watch progress into
 * one control.
 */
export function ProgressBorderPill({
  percent,
  children,
  strokeWidth = 2,
  className,
}: ProgressBorderPillProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sw = strokeWidth;
  const rw = Math.max(0, w - sw);
  const rh = Math.max(0, h - sw);
  const rr = Math.max(0, rh / 2);
  // Perimeter of a rounded rect with rx = ry = rr.
  const perim = w && h ? 2 * (rw - 2 * rr) + 2 * (rh - 2 * rr) + 2 * Math.PI * rr : 0;
  const frac = Math.min(1, Math.max(0, percent / 100));

  return (
    <span ref={ref} className={cn("relative inline-flex items-center", className)}>
      <svg
        width={w}
        height={h}
        className="pointer-events-none absolute inset-0"
        fill="none"
        aria-hidden="true"
      >
        {w > 0 && (
          <>
            <rect
              x={sw / 2}
              y={sw / 2}
              width={rw}
              height={rh}
              rx={rr}
              ry={rr}
              strokeWidth={sw}
              className="stroke-foreground/15"
            />
            <rect
              x={sw / 2}
              y={sw / 2}
              width={rw}
              height={rh}
              rx={rr}
              ry={rr}
              strokeWidth={sw}
              strokeLinecap="round"
              className="stroke-brand transition-[stroke-dashoffset] duration-500 ease-out"
              strokeDasharray={perim}
              strokeDashoffset={perim * (1 - frac)}
            />
          </>
        )}
      </svg>
      <span className="relative inline-flex items-center">{children}</span>
    </span>
  );
}
