/**
 * Series → markdown. Pure. Emits ONLY spoiler-free AI fields.
 *
 * Rich with navigable links (cast → person `.md`, ratings → source URLs, watch →
 * provider deep links, TMDB/IMDb/official-site). All from read-only PG data.
 */

import type { Series } from "@/types";
import type { AIDataResponse } from "@/server/services/ai-data-service";
import {
  assembleSections,
  canonicalUrl,
  castSection,
  externalLinksSection,
  oneLine,
  personLink,
  ratingsSection,
  titleWithYear,
  whereToWatchSection,
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
    const creators = series.created_by.map((c) =>
      typeof c.id === "number" ? personLink(c.id, c.name) : c.name
    );
    lines.push(`- Created by: ${creators.join(", ")}`);
  }
  if (series.networks?.length) {
    lines.push(`- Networks: ${series.networks.map((n) => n.name).join(", ")}`);
  }
  return `## Details\n${lines.join("\n")}`;
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
    ratingsSection(series.ratings, series.vote_average, series.vote_count),
    castSection(series.credits?.cast),
    seasonsSection(series),
    whereToWatchSection(series),
    externalLinksSection("tv", series.id, {
      imdbId: series.external_ids?.imdb_id,
      homepage: series.homepage,
    }),
    aiInsightsSection(aiData),
    canonical,
  ]);
}
