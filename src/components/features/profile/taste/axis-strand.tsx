import { AXIS_EXAMPLES_MIN_TO_OPEN, type TasteAxis } from "@/lib/taste/axes";
import { cn } from "@/lib/utils";
import { AxisCaption, CompareLegend, CompareMarker } from "./compare-overlay";
import { ExploreTrigger } from "./explore-trigger";
import { LazyAxisTitles } from "./lazy-bodies";
import { axisEndDescription, axisEndTitle } from "./taste-copy";

/**
 * The axis strand (taste v2 spec §4.2): five bipolar `h-2` tracks; the fill
 * grows from the centre tick to the owner's marker. Each endpoint label is a
 * door to the titles at that end (disabled under 3 examples). The viewer's
 * hollow compare marker + difference caption are client islands that render
 * nothing until "Compare with me" is on — this file has no "use client" and
 * renders the same HTML for every visitor.
 */
export function AxisStrand({ axes }: { axes: readonly TasteAxis[] }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-3 md:space-y-2.5">
        {axes.map((axis) => (
          <AxisRow key={axis.key} axis={axis} />
        ))}
      </ul>
      <CompareLegend />
    </div>
  );
}

function EndLabel({ axis, end, near }: { axis: TasteAxis; end: "low" | "high"; near: boolean }) {
  const examples = axis.examples[end];
  const label = end === "low" ? axis.lowLabel : axis.highLabel;
  const disabled = examples.length < AXIS_EXAMPLES_MIN_TO_OPEN;
  return (
    <ExploreTrigger
      tap={end === "low" ? "axis_low" : "axis_high"}
      disabled={disabled}
      ariaLabel={`Titles at the ${label} end`}
      title={axisEndTitle(axis, end)}
      description={axisEndDescription(axis, end)}
      label={label}
      className={cn(
        "-my-2 inline-flex min-h-10 items-center rounded-md px-1 py-2 text-xs font-medium md:-my-1 md:min-h-8 md:py-1",
        // The dotted underline says "tap me" — an end with too few titles is inert, so it goes.
        !disabled && "underline decoration-dotted underline-offset-4",
        near ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        end === "low" ? "-ml-1" : "-mr-1"
      )}
    >
      <LazyAxisTitles examples={examples} />
    </ExploreTrigger>
  );
}

function AxisRow({ axis }: { axis: TasteAxis }) {
  const pct = Math.round(axis.value * 100);
  const left = Math.min(pct, 50);
  const width = Math.abs(pct - 50);
  const caption = "text-xs font-medium text-muted-foreground";
  return (
    <li className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] md:items-center md:gap-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <EndLabel axis={axis} end="low" near={pct < 50} />
          <EndLabel axis={axis} end="high" near={pct > 50} />
        </div>
        <div
          className="relative mt-1 h-2 rounded-full bg-muted"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${axis.lowLabel} to ${axis.highLabel}`}
          aria-valuetext={axis.caption}
        >
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-border"
          />
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-full bg-brand/40"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
          <span
            aria-hidden
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"
            style={{ left: `${pct}%` }}
          />
          <CompareMarker axisKey={axis.key} label={`${axis.lowLabel} to ${axis.highLabel}`} />
        </div>
      </div>
      <AxisCaption
        axisKey={axis.key}
        caption={axis.caption}
        lowLabel={axis.lowLabel}
        highLabel={axis.highLabel}
        value={axis.value}
        className={cn(caption, "mt-1.5 md:mt-5 md:line-clamp-2")}
      />
    </li>
  );
}
