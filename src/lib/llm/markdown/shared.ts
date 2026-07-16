/**
 * Shared markdown helpers for the `.md` builders. Pure — no I/O.
 */

import { SITE_URL } from "@/lib/constants";
import { getMediaPath } from "@/lib/utils";
import type { CastMember, Rating, WatchProviderData } from "@/types";
import type { LlmCardItem } from "../data";

const TMDB_BASE = "https://www.themoviedb.org";
const IMDB_TITLE = "https://www.imdb.com/title";

/** Absolute canonical HTML URL for a media detail page. */
export function canonicalUrl(
  type: "movie" | "series" | "person",
  id: number,
  name?: string | null
): string {
  return `${SITE_URL}${getMediaPath(type, id, name)}`;
}

/** Absolute `.md` twin URL for a media detail page. */
export function markdownUrl(
  type: "movie" | "series" | "person",
  id: number,
  name?: string | null
): string {
  return `${canonicalUrl(type, id, name)}.md`;
}

/** Extract the year from a "YYYY-MM-DD" string. */
export function yearFromDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date);
  return match ? match[1] : null;
}

/** Title with a trailing "(Year)" when a year is available. */
export function titleWithYear(title: string, year: string | null): string {
  return year ? `${title} (${year})` : title;
}

/** Collapse whitespace/newlines so a value stays on one markdown line. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Trim an overview to a sentence-ish length for list contexts. */
export function trimOverview(overview: string | null | undefined, max = 200): string | null {
  if (!overview) return null;
  const clean = oneLine(overview);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A markdown list line for one catalog item, linking to its `.md` twin:
 * `- [Title (Year)](url.md) — Genre, Genre · TMDB 8.5`
 */
export function cardLine(item: LlmCardItem): string {
  const url = markdownUrl(item.mediaType, item.id, item.title);
  const label = titleWithYear(item.title, item.year);
  const bits: string[] = [];
  if (item.genres.length) bits.push(item.genres.slice(0, 3).join(", "));
  if (typeof item.rating === "number" && item.rating > 0) {
    bits.push(`TMDB ${item.rating.toFixed(1)}`);
  }
  const suffix = bits.length ? ` — ${bits.join(" · ")}` : "";
  return `- [${label}](${url})${suffix}`;
}

/**
 * Read watch providers for a country from a PG-hydrated Movie/Series object.
 * The PG transform stores providers under the off-type `"watch/providers"` key,
 * so we access it defensively rather than via the `Movie`/`Series` type.
 */
export function watchProvidersForCountry(
  media: unknown,
  countryCode: string
): WatchProviderData | null {
  if (typeof media !== "object" || media === null) return null;
  const wp = (media as Record<string, unknown>)["watch/providers"];
  if (typeof wp !== "object" || wp === null) return null;
  const results = (wp as Record<string, unknown>).results;
  if (typeof results !== "object" || results === null) return null;
  const country = (results as Record<string, unknown>)[countryCode];
  if (typeof country !== "object" || country === null) return null;
  return country as WatchProviderData;
}

/** An inline markdown link to a person's `.md` twin — lets agents navigate to cast. */
export function personLink(id: number, name: string): string {
  return `[${name}](${markdownUrl("person", id, name)})`;
}

/** A `/search.md?q=` link (agents can pull the rest of a collection/query). */
export function searchMarkdownUrl(query: string): string {
  return `${SITE_URL}/search.md?q=${encodeURIComponent(query)}`;
}

/** `## Cast` with each name linked to its person `.md` page. */
export function castSection(cast: CastMember[] | undefined, limit = 12): string | null {
  if (!cast?.length) return null;
  const lines = cast.slice(0, limit).map((c) => {
    const link = personLink(c.id, c.name);
    return c.character ? `- ${link} — ${c.character}` : `- ${link}`;
  });
  return `## Cast\n${lines.join("\n")}`;
}

/** `## Ratings` — each source linked to its external page when a link exists. */
export function ratingsSection(
  ratings: Rating[] | undefined,
  voteAverage: number,
  voteCount: number
): string | null {
  const list = ratings ?? [];
  if (list.length) {
    const lines = list.map((r) => {
      const label = `${r.name}: ${r.rating}`;
      return r.link ? `- [${label}](${r.link})` : `- ${label}`;
    });
    return `## Ratings\n${lines.join("\n")}`;
  }
  if (voteAverage > 0) {
    return `## Ratings\n- TMDB: ${voteAverage.toFixed(1)} (${voteCount} votes)`;
  }
  return null;
}

interface ScrapedWatchLink {
  name: string;
  link: string;
  price?: string;
}

/**
 * Read the scraped deep-link watch options for a country off a PG-hydrated
 * media object. Stored under the off-type `scraped_watch_links` key (a
 * `Record<countryCode, {name,link,price?}[]>`), so accessed defensively.
 */
export function scrapedLinksForCountry(
  media: unknown,
  countryCode: string
): ScrapedWatchLink[] | null {
  if (typeof media !== "object" || media === null) return null;
  const swl = (media as Record<string, unknown>).scraped_watch_links;
  if (typeof swl !== "object" || swl === null) return null;
  const arr = (swl as Record<string, unknown>)[countryCode];
  if (!Array.isArray(arr)) return null;
  const links = arr.filter(
    (x): x is ScrapedWatchLink =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as ScrapedWatchLink).name === "string" &&
      typeof (x as ScrapedWatchLink).link === "string"
  );
  return links.length ? links : null;
}

/**
 * `## Where to watch (India)` — direct player deep links (scraped) first, then
 * TMDB/JustWatch provider names by tier, then the JustWatch "all options" link.
 * All actionable URLs so an agent can route a user to where to watch.
 */
export function whereToWatchSection(media: unknown, countryCode = "IN"): string | null {
  const providers = watchProvidersForCountry(media, countryCode);
  const scraped = scrapedLinksForCountry(media, countryCode);
  const parts: string[] = [];
  if (scraped) {
    for (const s of scraped) {
      parts.push(`- [${s.name}](${s.link})${s.price ? ` (${s.price})` : ""}`);
    }
  }
  if (providers?.flatrate?.length) {
    parts.push(`- Stream: ${providers.flatrate.map((p) => p.provider_name).join(", ")}`);
  }
  if (providers?.rent?.length) {
    parts.push(`- Rent: ${providers.rent.map((p) => p.provider_name).join(", ")}`);
  }
  if (providers?.buy?.length) {
    parts.push(`- Buy: ${providers.buy.map((p) => p.provider_name).join(", ")}`);
  }
  if (providers?.link) parts.push(`- [All options (JustWatch)](${providers.link})`);
  if (!parts.length) return null;
  return `## Where to watch (India)\n${parts.join("\n")}`;
}

/** `## Links` — external references (TMDB always; IMDb / official site when known). */
export function externalLinksSection(
  tmdbType: "movie" | "tv" | "person",
  tmdbId: number,
  opts: { imdbId?: string | null; homepage?: string | null } = {}
): string {
  const lines: string[] = [`- [TMDB](${TMDB_BASE}/${tmdbType}/${tmdbId})`];
  if (opts.imdbId) {
    const imdbUrl =
      tmdbType === "person"
        ? `https://www.imdb.com/name/${opts.imdbId}/`
        : `${IMDB_TITLE}/${opts.imdbId}/`;
    lines.push(`- [IMDb](${imdbUrl})`);
  }
  if (opts.homepage) lines.push(`- [Official site](${opts.homepage})`);
  return `## Links\n${lines.join("\n")}`;
}

/** Join non-empty sections with blank lines and end with a single trailing newline. */
export function assembleSections(sections: (string | null)[]): string {
  return `${sections.filter((s): s is string => Boolean(s)).join("\n\n")}\n`;
}
