/**
 * Movie → markdown. Pure. Emits ONLY spoiler-free AI fields.
 */

import type { Movie } from "@/types";
import type { AIDataResponse } from "@/server/services/ai-data-service";
import {
  assembleSections,
  canonicalUrl,
  oneLine,
  titleWithYear,
  watchProvidersForCountry,
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

  const ratings = movie.ratings ?? [];
  if (ratings.length) {
    lines.push(`- Ratings: ${ratings.map((r) => `${r.name} ${r.rating}`).join(" · ")}`);
  } else if (movie.vote_average > 0) {
    lines.push(`- Ratings: TMDB ${movie.vote_average.toFixed(1)} (${movie.vote_count} votes)`);
  }

  return `## Details\n${lines.join("\n")}`;
}

function castSection(movie: Movie): string | null {
  const cast = movie.credits?.cast ?? [];
  if (!cast.length) return null;
  const lines = cast
    .slice(0, 10)
    .map((c) => (c.character ? `- ${c.name} — ${c.character}` : `- ${c.name}`));
  return `## Cast\n${lines.join("\n")}`;
}

function crewLine(movie: Movie): string | null {
  const directors = (movie.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  if (!directors.length) return null;
  return `- Director: ${[...new Set(directors)].join(", ")}`;
}

function whereToWatchSection(movie: Movie): string | null {
  const india = watchProvidersForCountry(movie, "IN");
  if (!india) return null;
  const parts: string[] = [];
  if (india.flatrate?.length) {
    parts.push(`- Stream: ${india.flatrate.map((p) => p.provider_name).join(", ")}`);
  }
  if (india.rent?.length) {
    parts.push(`- Rent: ${india.rent.map((p) => p.provider_name).join(", ")}`);
  }
  if (india.buy?.length) {
    parts.push(`- Buy: ${india.buy.map((p) => p.provider_name).join(", ")}`);
  }
  if (!parts.length) return null;
  return `## Where to watch (India)\n${parts.join("\n")}`;
}

export function movieToMarkdown(movie: Movie, aiData: AIDataResponse | null): string {
  const year = yearFromDate(movie.release_date);
  const heading = `# ${titleWithYear(movie.title, year)}`;

  // Blockquote summary: AI hook > tagline > overview lead.
  const summarySource = aiData?.hook || movie.tagline || movie.overview;
  const summary = summarySource ? `> ${oneLine(summarySource)}` : null;

  const overview = movie.overview ? `## Overview\n${oneLine(movie.overview)}` : null;

  const crew = crewLine(movie);
  const details = crew ? `${detailsSection(movie)}\n${crew}` : detailsSection(movie);

  const mood = moodLine(aiData);
  const detailsWithMood = mood ? `${details}\n${mood}` : details;

  const canonical = `[View on The Movie Browser](${canonicalUrl("movie", movie.id, movie.title)})`;

  return assembleSections([
    heading,
    summary,
    overview,
    detailsWithMood,
    castSection(movie),
    whereToWatchSection(movie),
    aiInsightsSection(aiData),
    canonical,
  ]);
}
