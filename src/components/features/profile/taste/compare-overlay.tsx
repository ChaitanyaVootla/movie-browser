"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TasteAxisKey } from "@/lib/taste/axes";
import { getViewerTasteAxes } from "@/server/actions/taste-explore";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";
import { differenceCaption } from "./taste-copy";

/**
 * "Compare with me" (taste v2 spec §4.5). The Taste card is server-rendered
 * from the owner's PUBLIC snapshot; this provider wraps it client-side and, on
 * request, loads the VIEWER's PUBLIC axes (server action, POST — never in the
 * cached HTML). Markers, captions and the legend below read it; with compare
 * off they render exactly the server copy, so the cached HTML carries no
 * viewer data at all.
 */

/** Window event that turns compare on from outside the card (match card "Compare on the strand"). */
export const TASTE_COMPARE_EVENT = "taste-compare-request";

type CompareStatus =
  | "idle"
  | "loading"
  | "ready"
  | "insufficient"
  | "hidden"
  | "signed_out"
  | "error";

interface CompareState {
  on: boolean;
  status: CompareStatus;
  viewer: ReadonlyMap<TasteAxisKey, number>;
  ownerName: string;
  /** Load (once) and show the overlay; resolves to the resulting status. */
  enable: () => Promise<CompareStatus>;
  disable: () => void;
}

const CompareContext = createContext<CompareState | null>(null);

const NOOP: CompareState = {
  on: false,
  status: "idle",
  viewer: new Map(),
  ownerName: "",
  enable: async () => "idle",
  disable: () => {},
};

export function useTasteCompare(): CompareState {
  return useContext(CompareContext) ?? NOOP;
}

export function TasteCompareProvider({
  ownerName,
  children,
}: {
  ownerName: string;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<CompareStatus>("idle");
  const [viewer, setViewer] = useState<ReadonlyMap<TasteAxisKey, number>>(new Map());
  const { trackAction } = useAnalytics();
  const loaded = useRef<Promise<CompareStatus> | null>(null);

  const enable = useCallback(async (): Promise<CompareStatus> => {
    if (!loaded.current) {
      setStatus("loading");
      loaded.current = getViewerTasteAxes()
        .then((r): CompareStatus => {
          if (r.status !== "ready") return r.status;
          setViewer(new Map(r.axes.map((a) => [a.key, a.value])));
          return "ready";
        })
        .catch((): CompareStatus => "error");
    }
    const next = await loaded.current;
    setStatus(next);
    if (next === "error") loaded.current = null; // allow a retry
    if (next === "ready") {
      setOn(true);
      trackAction({ action: "taste_compare_toggle", metadata: { on: true } });
    }
    return next;
  }, [trackAction]);

  const disable = useCallback(() => {
    setOn(false);
    trackAction({ action: "taste_compare_toggle", metadata: { on: false } });
  }, [trackAction]);

  useEffect(() => {
    const onRequest = () => void enable();
    window.addEventListener(TASTE_COMPARE_EVENT, onRequest);
    return () => window.removeEventListener(TASTE_COMPARE_EVENT, onRequest);
  }, [enable]);

  const value = useMemo(
    () => ({ on, status, viewer, ownerName, enable, disable }),
    [on, status, viewer, ownerName, enable, disable]
  );
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

/** The viewer's hollow marker on one track (shape, not hue — DESIGN.md social signals). */
export function CompareMarker({ axisKey, label }: { axisKey: TasteAxisKey; label: string }) {
  const { on, viewer } = useTasteCompare();
  const value = viewer.get(axisKey);
  const [placed, setPlaced] = useState(false);
  const show = on && value !== undefined;

  useEffect(() => {
    if (!show) return;
    // Mount at the centre tick, then travel to the value once (CSS transition).
    const id = requestAnimationFrame(() => setPlaced(true));
    return () => {
      cancelAnimationFrame(id);
      setPlaced(false);
    };
  }, [show]);

  if (!show) return null;
  const pct = Math.round((value ?? 0.5) * 100);
  return (
    <span
      role="img"
      aria-label={`You: ${pct} on ${label}`}
      data-compare-marker={axisKey}
      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card transition-[left] duration-300 ease-out motion-reduce:transition-none"
      style={{ left: `${placed ? pct : 50}%` }}
    />
  );
}

/** Server caption by default; the difference template while compare is on. */
export function AxisCaption({
  axisKey,
  caption,
  lowLabel,
  highLabel,
  value,
  className,
}: {
  axisKey: TasteAxisKey;
  caption: string;
  lowLabel: string;
  highLabel: string;
  value: number;
  className?: string;
}) {
  const { on, viewer } = useTasteCompare();
  const v = viewer.get(axisKey);
  const text =
    on && v !== undefined ? differenceCaption({ lowLabel, highLabel, value }, v) : caption;
  return <p className={cn(className, on && v !== undefined && "text-foreground")}>{text}</p>;
}

/** "● Ada  ○ You" under the strand while compare is on. */
export function CompareLegend() {
  const { on, ownerName } = useTasteCompare();
  if (!on) return null;
  return (
    <p
      className="flex items-center gap-4 text-xs font-medium text-muted-foreground"
      data-compare-legend
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full bg-brand" />
        {ownerName}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full border-2 border-foreground bg-card" />
        You
      </span>
    </p>
  );
}
