import { fetchJson, isRecord } from "../lib/http";
import type { SourceStatus } from "../lib/result";
import type { ExternalIds, MediaType } from "../lib/types";

const API = "https://www.wikidata.org/w/api.php";

/** Wikidata property → our external-id key. */
const PROPS: Record<string, keyof ExternalIds> = {
  P345: "imdb",
  P1258: "rottentomatoes",
  P1712: "metacritic",
  P6127: "letterboxd",
  P1874: "netflix",
  P8055: "amazon",
  P9586: "apple",
  P11049: "hotstar",
};

/** TMDB id property differs for films vs series. */
const TMDB_PROP: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

const QID_RE = /^Q\d+$/;

/** Find the entity id via a statement search (`haswbstatement:P345=tt…`). */
async function searchByStatement(prop: string, value: string): Promise<string | null> {
  const url = `${API}?action=query&list=search&format=json&srlimit=2&srsearch=${encodeURIComponent(
    `haswbstatement:${prop}=${value}`
  )}`;
  const data = await fetchJson<unknown>(url, { botUa: true });
  const hits =
    isRecord(data) && isRecord(data.query) && Array.isArray(data.query.search) ? data.query.search : [];
  const first = hits[0];
  return isRecord(first) && typeof first.title === "string" && QID_RE.test(first.title) ? first.title : null;
}

/** Pull the first string value of each property we care about out of a wbgetentities claims blob. */
export function parseClaims(claims: unknown): ExternalIds {
  const ids: ExternalIds = {};
  if (!isRecord(claims)) return ids;
  for (const [prop, key] of Object.entries(PROPS)) {
    const list = claims[prop];
    if (!Array.isArray(list)) continue;
    // prefer the "preferred" rank, else the first normal-rank statement
    const ranked = [...list].sort((a, b) => rankOf(b) - rankOf(a));
    for (const stmt of ranked) {
      const value = isRecord(stmt) && isRecord(stmt.mainsnak) && isRecord(stmt.mainsnak.datavalue)
        ? stmt.mainsnak.datavalue.value
        : undefined;
      if (typeof value === "string" && value.trim()) {
        ids[key] = value.trim();
        break;
      }
    }
  }
  return ids;
}

function rankOf(stmt: unknown): number {
  const rank = isRecord(stmt) ? stmt.rank : undefined;
  return rank === "preferred" ? 2 : rank === "normal" ? 1 : 0;
}

export async function resolveWikidata(input: {
  wikidataId?: string;
  imdbId?: string;
  tmdbId: number;
  mediaType: MediaType;
}): Promise<{ status: SourceStatus; data?: ExternalIds; detail?: string; url?: string }> {
  let qid = input.wikidataId && QID_RE.test(input.wikidataId) ? input.wikidataId : null;
  let how = "tmdb";
  if (!qid && input.imdbId) {
    qid = await searchByStatement("P345", input.imdbId);
    how = "imdb-lookup";
  }
  if (!qid) {
    qid = await searchByStatement(TMDB_PROP[input.mediaType], String(input.tmdbId));
    how = "tmdb-lookup";
  }
  if (!qid) return { status: "no_id", detail: "no wikidata entity for imdb/tmdb id" };

  const url = `${API}?action=wbgetentities&format=json&props=claims&ids=${qid}`;
  const data = await fetchJson<unknown>(url, { botUa: true });
  const entity = isRecord(data) && isRecord(data.entities) ? data.entities[qid] : undefined;
  if (!isRecord(entity) || !isRecord(entity.claims)) {
    return { status: "parse_error", detail: `no claims for ${qid}`, url };
  }
  const ids = { wikidata: qid, ...parseClaims(entity.claims) };
  return { status: "ok", data: ids, detail: how, url };
}
