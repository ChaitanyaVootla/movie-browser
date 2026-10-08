import { fetchText, isRecord, toNumber } from "../lib/http";
import { SourceError, type SourceStatus } from "../lib/result";
import { normalizeTitle, stripTags, yearsMatch } from "../lib/text";
import type { MediaType, RtData, RtScore } from "../lib/types";

const BASE = "https://www.rottentomatoes.com";

/** RT ids from Wikidata look like "m/slug" or "tv/slug"; bare slugs get a media prefix. */
export function rtUrlFromId(id: string, mediaType: MediaType): string {
  const clean = id.replace(/^\/+/, "");
  if (/^(m|tv)\//.test(clean)) return `${BASE}/${clean}`;
  return `${BASE}/${mediaType === "tv" ? "tv" : "m"}/${clean}`;
}

export function rtIdFromUrl(url: string): string | null {
  const m = url.match(/rottentomatoes\.com\/((?:m|tv)\/[^/?#]+)/);
  return m ? m[1] : null;
}

function scoreFrom(block: unknown): Omit<RtScore, "consensus"> | null {
  if (!isRecord(block)) return null;
  const score = toNumber(block.score);
  const ratingCount = toNumber(block.ratingCount) ?? toNumber(block.reviewCount);
  if (score === null && ratingCount === null) return null;
  const certified =
    typeof block.certified === "boolean"
      ? block.certified
      : typeof block.certifiedFresh === "string"
        ? block.certifiedFresh !== "none"
        : null;
  return {
    score,
    ratingCount,
    certified,
    sentiment: typeof block.sentiment === "string" ? block.sentiment : null,
  };
}

/**
 * Parse an RT title page. The source of truth is the `#media-scorecard-json`
 * blob RT renders for its own scorecard (Tomatometer + Popcornmeter) — far
 * sturdier than the old `rt-text[slot=…]` selectors, which is why the audience
 * score had silently dropped to ~4% coverage.
 */
export function parseRtPage(html: string, sourceUrl: string): { status: SourceStatus; data?: RtData } {
  const m = html.match(/<script[^>]*id="media-scorecard-json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new SourceError("parse_error", "media-scorecard-json missing", 200, sourceUrl);
  let json: unknown;
  try {
    json = JSON.parse(m[1].trim());
  } catch {
    throw new SourceError("parse_error", "media-scorecard-json not JSON", 200, sourceUrl);
  }
  if (!isRecord(json)) throw new SourceError("parse_error", "media-scorecard-json shape", 200, sourceUrl);

  const consensusMatch = html.match(/id="critics-consensus"[\s\S]*?<p>([\s\S]*?)<\/p>/);
  const audienceConsensusMatch = html.match(/id="audience-consensus"[\s\S]*?<p>([\s\S]*?)<\/p>/);

  const critic = scoreFrom(json.criticsScore);
  const audience = scoreFrom(json.audienceScore);
  const data: RtData = {
    critic: critic
      ? { ...critic, consensus: consensusMatch ? stripTags(consensusMatch[1]) || null : null }
      : null,
    audience: audience
      ? {
          ...audience,
          consensus: audienceConsensusMatch ? stripTags(audienceConsensusMatch[1]) || null : null,
        }
      : null,
    sourceUrl,
  };
  const hasScore = data.critic?.score != null || data.audience?.score != null;
  return { status: hasScore ? "ok" : "empty", data };
}

export interface RtSearchRow {
  url: string;
  title: string;
  year: number | null;
}

/** Parse RT's /search page into rows, restricted to the matching result type. */
export function parseRtSearch(html: string, mediaType: MediaType): RtSearchRow[] {
  const wanted = mediaType === "tv" ? "tvSeries" : "movie";
  const sectionRe = /<search-page-result[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/search-page-result>/g;
  const rows: RtSearchRow[] = [];
  let s: RegExpExecArray | null;
  while ((s = sectionRe.exec(html)) !== null) {
    if (s[1] !== wanted) continue;
    const rowRe = /<search-page-media-row([^>]*)>([\s\S]*?)<\/search-page-media-row>/g;
    let r: RegExpExecArray | null;
    while ((r = rowRe.exec(s[2])) !== null) {
      const attrs = r[1];
      const yearAttr =
        attrs.match(/release-year="(\d{4})"/)?.[1] ?? attrs.match(/start-year="(\d{4})"/)?.[1];
      const link = r[2].match(/<a[^>]*href="([^"]+)"[^>]*data-qa="info-name"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue;
      rows.push({ url: link[1], title: stripTags(link[2]), year: yearAttr ? Number(yearAttr) : null });
    }
  }
  return rows;
}

export function pickRtMatch(
  rows: RtSearchRow[],
  titles: string[],
  year: number | undefined
): RtSearchRow | null {
  const wanted = new Set(titles.filter(Boolean).map(normalizeTitle));
  // exact title + year within 1 — the year check is what keeps remakes apart
  return rows.find((r) => wanted.has(normalizeTitle(r.title)) && yearsMatch(r.year, year)) ?? null;
}

export async function scrapeRottenTomatoes(input: {
  rtId?: string;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
}): Promise<{ status: SourceStatus; data?: RtData & { rtId: string }; url?: string; detail?: string }> {
  let url: string;
  let how: string;
  if (input.rtId) {
    url = rtUrlFromId(input.rtId, input.mediaType);
    how = "wikidata-id";
  } else {
    if (!input.year) return { status: "no_id", detail: "no rt id and no year to verify a search hit" };
    const q = encodeURIComponent(input.title);
    const search = await fetchText(`${BASE}/search?search=${q}`);
    const rows = parseRtSearch(search.body, input.mediaType);
    if (search.body.includes("search__no-results")) {
      return { status: "not_found", detail: "rt search: no results", url: search.url };
    }
    if (rows.length === 0 && !search.body.includes("search-page-result")) {
      throw new SourceError("parse_error", "search page structure missing", 200, search.url);
    }
    const match = pickRtMatch(rows, [input.title, input.originalTitle ?? ""], input.year);
    if (!match) return { status: "not_found", detail: `no search match (${rows.length} rows)`, url: search.url };
    url = match.url;
    how = "search";
  }
  const page = await fetchText(url);
  const parsed = parseRtPage(page.body, page.url);
  const rtId = rtIdFromUrl(page.url) ?? rtIdFromUrl(url) ?? input.rtId ?? "";
  return {
    status: parsed.status,
    data: parsed.data ? { ...parsed.data, rtId } : undefined,
    url: page.url,
    detail: how,
  };
}
