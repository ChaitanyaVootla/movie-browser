"use client";

import type { TasteClusterView } from "@/lib/taste/profile";
import type { FacetStat } from "@/lib/taste/lift";
import { EvidenceGrid } from "./evidence-grid";
import { ExploreTrigger } from "./explore-trigger";
import { moodEvidenceLine } from "./taste-copy";

/**
 * Cluster explorer body (taste v2 spec §4.3): the cluster's PUBLIC members
 * (≤12, medoid first) and its other lifted facets. A facet that is also one of
 * the profile's moods opens that mood's evidence (nested layer; Back closes the
 * top one). Loaded lazily — only mounted once the explorer opens.
 */
export function ClusterExplorerBody({
  cluster,
  moods,
}: {
  cluster: TasteClusterView;
  moods: readonly FacetStat[];
}) {
  const also = cluster.topFacets.slice(1);
  return (
    <div className="space-y-3">
      <EvidenceGrid titles={cluster.members.length > 0 ? cluster.members : [cluster.medoid]} />
      {also.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Also</span>
          {also.map((label) => {
            const mood = moods.find((m) => m.label.toLowerCase() === label.toLowerCase());
            const chip =
              "inline-flex min-h-10 items-center rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground md:min-h-8";
            return mood ? (
              <ExploreTrigger
                key={label}
                tap="mood"
                title={mood.label}
                description={moodEvidenceLine(mood)}
                label={
                  <span className="underline decoration-dotted underline-offset-4">{label}</span>
                }
                className={`${chip} hover:text-foreground`}
              >
                <EvidenceGrid titles={mood.titles} />
              </ExploreTrigger>
            ) : (
              <span key={label} className={chip}>
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
