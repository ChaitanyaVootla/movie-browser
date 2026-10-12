"use client";

import type { AxisExample } from "@/lib/taste/axes";
import { EvidenceGrid } from "./evidence-grid";

/**
 * Axis titles sheet body (taste v2 spec §4.4): the favourites at one end of an
 * axis, each with its own number (popularity rank, year, genre count, score vs
 * TMDB, mood). Loaded lazily — only mounted once the sheet opens.
 */
export function AxisTitlesBody({ examples }: { examples: readonly AxisExample[] }) {
  return <EvidenceGrid titles={examples} />;
}
