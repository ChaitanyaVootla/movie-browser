/**
 * Movie → markdown. Pure. Emits ONLY spoiler-free AI fields.
 *
 * Rich with navigable links so agents can traverse the catalog + act:
 * cast → person `.md`, ratings → external source URLs, watch → provider deep
 * links, plus TMDB/IMDb/official-site references. All from read-only PG data.
 */

import type { Movie } from "@/types";
import type { AIDataResponse } from "@/server/services/ai-data-service";
import {
  assembleSections,
  canonicalUrl,
  castSection,
  externalLinksSection,
  oneLine,
  personLink,
  ratingsSection,
  searchMarkdownUrl,
  titleWithYear,
  whereToWatchSection,
  yearFromDate,
} from "./shared";
import { aiInsightsSection, moodLine } from "./ai-insights";

function detailsSection(movie: Movie): string {
  const lines: string[] = [];
  if (movie.genres.length) lines.push(`- Genres: ${movie.genres.map((g) => g.name).join(", ")}`);
  if (movie.runtime && movie.runtime > 0) lines.push(`- Runtime: ${movie.runtime} min`);
  if (movie.release_date) lines.push(`- Released: ${movie.release_date}`);
  if (movie.status) lines.push(`- Status: ${movie.status}`);
  if (movie.original_language) lines.push(`- Original language: ${movie.original_language}`);
  if (movie.origin_country?.length) lines.push(`- Origin: ${movie.origin_country.join(", ")}`);

  const directors = [
    ...new Map(
      (movie.credits?.crew ?? [])
        .filter((c) => c.job === "Director")
        .map((c) => [c.id, c])
    ).values(),
  ];
  if (directors.length) {
    lines.push(`- Director: ${directors.map((d) => personLink(d.id, d.name)).join(", ")}`);
  }

  const collection = movie.belongs_to_collection;
  if (collection?.name) {
    lines.push(`- Part of: [${collection.name}](${searchMarkdownUrl(collection.name)})`);
  }

  return `## Details\n${lines.join("\n")}`;
}

export function movieToMarkdown(movie: Movie, aiData: AIDataResponse | null): string {
  const year = yearFromDate(movie.release_date);
  const heading = `# ${titleWithYear(movie.title, year)}`;

  // Blockquote summary: AI hook > tagline > overview lead.
  const summarySource = aiData?.hook || movie.tagline || movie.overview;
  const summary = summarySource ? `> ${oneLine(summarySource)}` : null;

  const overview = movie.overview ? `## Overview\n${oneLine(movie.overview)}` : null;

  const mood = moodLine(aiData);
  const details = mood ? `${detailsSection(movie)}\n${mood}` : detailsSection(movie);

  const canonical = `[View on The Movie Browser](${canonicalUrl("movie", movie.id, movie.title)})`;

  return assembleSections([
    heading,
    summary,
    overview,
    details,
    ratingsSection(movie.ratings, movie.vote_average, movie.vote_count),
    castSection(movie.credits?.cast),
    whereToWatchSection(movie),
    externalLinksSection("movie", movie.id, {
      imdbId: movie.imdb_id,
      homepage: movie.homepage,
    }),
    aiInsightsSection(aiData),
    canonical,
  ]);
}
