/**
 * Search results → markdown. Pure.
 *
 * Accepts the PG-native `HybridSearchResult[]` from `hybridQuickSearch`
 * (movies, series, AND people) and renders a ranked list of `.md` links.
 */

import type { HybridSearchResult } from "@/lib/search/hybrid";
import { assembleSections, markdownUrl, titleWithYear } from "./shared";

function resultLine(result: HybridSearchResult): string {
  const url = markdownUrl(result.mediaType, result.id, result.title);
  const label = titleWithYear(result.title, result.year);
  const bits: string[] = [];
  bits.push(result.mediaType === "person" ? "Person" : result.mediaType === "series" ? "Series" : "Movie");
  if (result.genres?.length) bits.push(result.genres.slice(0, 3).join(", "));
  if (typeof result.voteAverage === "number" && result.voteAverage > 0) {
    bits.push(`TMDB ${result.voteAverage.toFixed(1)}`);
  }
  return `- [${label}](${url}) — ${bits.join(" · ")}`;
}

export function searchToMarkdown(query: string, results: HybridSearchResult[]): string {
  const heading = `# Search: ${query}`;
  const body = results.length
    ? results.map(resultLine).join("\n")
    : `_No results for "${query}"._`;
  return assembleSections([heading, body]);
}
