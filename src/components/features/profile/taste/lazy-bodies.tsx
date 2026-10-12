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

/**
 * The plain evidence grid as a lazy CLIENT body. Server parents (MoodChip, the
 * Four-Favourites fallback) must pass data, not a rendered <EvidenceGrid/>: a
 * server element handed to a client island is rendered on the server and
 * shipped in the RSC payload — every closed chip carried its full poster grid
 * (~half the /u/* page weight).
 */
export const LazyEvidenceGrid = dynamic(() => import("./evidence-grid").then((m) => m.EvidenceGrid), {
  loading: BodySkeleton,
});

export const LazyAxisTitles = dynamic(
  () => import("./axis-titles-sheet").then((m) => m.AxisTitlesBody),
  {
    loading: BodySkeleton,
  }
);
