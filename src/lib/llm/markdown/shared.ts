/**
 * Shared markdown helpers for the `.md` builders. Pure — no I/O.
 */

import { SITE_URL } from "@/lib/constants";
import { getMediaPath } from "@/lib/utils";
import type { WatchProviderData } from "@/types";
import type { LlmCardItem } from "../data";

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

/** Join non-empty sections with blank lines and end with a single trailing newline. */
export function assembleSections(sections: (string | null)[]): string {
  return `${sections.filter((s): s is string => Boolean(s)).join("\n\n")}\n`;
}
