"use client";

import dynamic from "next/dynamic";

/**
 * Lazy sheet bodies for the Taste card (performance.md §15: nothing that only
 * mounts on tap belongs in the profile's entry JS). The ExploreTrigger mounts
 * its body only while open, so these chunks load on the first tap.
 */
function BodySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export const LazyClusterExplorer = dynamic(
  () => import("./cluster-explorer").then((m) => m.ClusterExplorerBody),
  { loading: BodySkeleton }
);

export const LazyAxisTitles = dynamic(() => import("./axis-titles-sheet").then((m) => m.AxisTitlesBody), {
  loading: BodySkeleton,
});
