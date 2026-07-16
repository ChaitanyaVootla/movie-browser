/**
 * Series → markdown. Pure. Emits ONLY spoiler-free AI fields.
 */

import type { Series } from "@/types";
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

function detailsSection(series: Series): string {
  const lines: string[] = [];
  if (series.genres.length) lines.push(`- Genres: ${series.genres.map((g) => g.name).join(", ")}`);
  if (series.number_of_seasons) {
    const eps = series.number_of_episodes ? `, ${series.number_of_episodes} episodes` : "";
    lines.push(`- Seasons: ${series.number_of_seasons}${eps}`);
  }
  const runtime = series.episode_run_time?.find((r) => r > 0);
  if (runtime) lines.push(`- Episode runtime: ~${runtime} min`);
  if (series.first_air_date) lines.push(`- First aired: ${series.first_air_date}`);
  if (series.last_air_date) lines.push(`- Last aired: ${series.last_air_date}`);
  if (series.status) lines.push(`- Status: ${series.status}`);
  if (series.original_language) lines.push(`- Original language: ${series.original_language}`);
  if (series.origin_country?.length) lines.push(`- Origin: ${series.origin_country.join(", ")}`);
  if (series.created_by?.length) {
    lines.push(`- Created by: ${series.created_by.map((c) => c.name).join(", ")}`);
  }
  if (series.networks?.length) {
    lines.push(`- Networks: ${series.networks.map((n) => n.name).join(", ")}`);
  }

  const ratings = series.ratings ?? [];
  if (ratings.length) {
    lines.push(`- Ratings: ${ratings.map((r) => `${r.name} ${r.rating}`).join(" · ")}`);
  } else if (series.vote_average > 0) {
    lines.push(`- Ratings: TMDB ${series.vote_average.toFixed(1)} (${series.vote_count} votes)`);
  }

  return `## Details\n${lines.join("\n")}`;
}

function castSection(series: Series): string | null {
  const cast = series.credits?.cast ?? [];
  if (!cast.length) return null;
  const lines = cast
    .slice(0, 10)
    .map((c) => (c.character ? `- ${c.name} — ${c.character}` : `- ${c.name}`));
  return `## Cast\n${lines.join("\n")}`;
}

function seasonsSection(series: Series): string | null {
  const seasons = (series.seasons ?? []).filter((s) => s.season_number > 0);
  if (!seasons.length) return null;
  const lines = seasons.map((s) => {
    const year = yearFromDate(s.air_date);
    const eps = s.episode_count ? ` — ${s.episode_count} episodes` : "";
    return `- ${s.name}${year ? ` (${year})` : ""}${eps}`;
  });
  return `## Seasons\n${lines.join("\n")}`;
}

function whereToWatchSection(series: Series): string | null {
  const india = watchProvidersForCountry(series, "IN");
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

export function seriesToMarkdown(series: Series, aiData: AIDataResponse | null): string {
  const year = yearFromDate(series.first_air_date);
  const heading = `# ${titleWithYear(series.name, year)}`;

  const summarySource = aiData?.hook || series.tagline || series.overview;
  const summary = summarySource ? `> ${oneLine(summarySource)}` : null;

  const overview = series.overview ? `## Overview\n${oneLine(series.overview)}` : null;

  const mood = moodLine(aiData);
  const details = mood ? `${detailsSection(series)}\n${mood}` : detailsSection(series);

  const canonical = `[View on The Movie Browser](${canonicalUrl("series", series.id, series.name)})`;

  return assembleSections([
    heading,
    summary,
    overview,
    details,
    castSection(series),
    seasonsSection(series),
    whereToWatchSection(series),
    aiInsightsSection(aiData),
    canonical,
  ]);
}
