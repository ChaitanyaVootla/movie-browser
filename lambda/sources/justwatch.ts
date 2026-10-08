import { fetchText, isRecord } from "../lib/http";
import { SourceError, type SourceStatus } from "../lib/result";
import type { MediaType, WatchLink } from "../lib/types";

const ENDPOINT = "https://apis.justwatch.com/graphql";

/**
 * JustWatch is the data behind TMDB's own watch-provider lists, so its
 * provider names line up with TMDB's exactly — but unlike TMDB it exposes the
 * per-title deep link (`standardWebURL`: Netflix /title/…, Prime `gti=`,
 * Hotstar ids…). This replaces the Google-panel scrape, which died when Google
 * switched these queries to AI Overviews (0 ratings in 16,086/16,086 calls,
 * Oct 2026).
 */
const SEARCH_QUERY = `query S($q:String!,$c:Country!,$l:Language!,$t:[ObjectType!]){
  popularTitles(country:$c, first:8, filter:{searchQuery:$q, objectTypes:$t}){
    edges{ node{ id objectType content(country:$c,language:$l){ title originalReleaseYear externalIds{ tmdbId imdbId } } } }
  }
}`;

const OFFER_FIELDS =
  "monetizationType presentationType standardWebURL retailPrice(language:$l) package{ clearName }";

/** Physical-media offers (Amazon DVD, Barnes & Noble…) are not "where to watch". */
const PHYSICAL_PRESENTATION = new Set(["DVD", "BLURAY"]);
const PHYSICAL_NAME = /dvd|blu-?ray|barnes\s*&?\s*noble/i;

/** Tracking params JustWatch adds (incl. its own Amazon affiliate tag) — never pass them on. */
const TRACKING_PARAMS = /^(tag|ascsubtag|linkCode|ref_?|utm_[a-z]+|u[0-9]+|subId[0-9]*|irclickid|clickref)$/i;

export function cleanDeepLink(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function offersQuery(countries: string[]): string {
  const aliases = countries.map((c) => `${c}: offers(country:${c}, platform:WEB){ ${OFFER_FIELDS} }`).join(" ");
  return `query O($id:ID!,$l:Language!){ node(id:$id){ id ... on MovieOrShow { ${aliases} } } }`;
}

async function gql(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchText(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new SourceError("parse_error", "graphql response not JSON", res.status, ENDPOINT);
  }
  if (!isRecord(json)) throw new SourceError("parse_error", "graphql shape", res.status, ENDPOINT);
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const first = json.errors[0];
    const msg = isRecord(first) && typeof first.message === "string" ? first.message : "graphql error";
    // A schema change shows up here, not as an HTTP error.
    throw new SourceError("parse_error", `graphql: ${msg.slice(0, 200)}`, res.status, ENDPOINT);
  }
  if (!isRecord(json.data)) throw new SourceError("parse_error", "graphql missing data", res.status, ENDPOINT);
  return json.data;
}

/** Find the JustWatch node whose TMDB id matches ours — never trust a title match alone. */
export function pickNode(data: Record<string, unknown>, tmdbId: number): string | null {
  const pt = data.popularTitles;
  const edges = isRecord(pt) && Array.isArray(pt.edges) ? pt.edges : [];
  for (const e of edges) {
    const node = isRecord(e) ? e.node : null;
    if (!isRecord(node) || typeof node.id !== "string") continue;
    const content = isRecord(node.content) ? node.content : null;
    const ext = content && isRecord(content.externalIds) ? content.externalIds : null;
    if (ext && String(ext.tmdbId) === String(tmdbId)) return node.id;
  }
  return null;
}

const MONETIZATION_RANK: Record<string, number> = { FLATRATE: 0, FREE: 1, ADS: 2, RENT: 3, BUY: 4 };

function priceLabel(monetization: string, retail: unknown): string {
  const price = typeof retail === "string" ? retail.replace(/\.00$/, "") : "";
  switch (monetization) {
    case "FLATRATE":
      return "Subscription";
    case "FREE":
    case "ADS":
      return "Free";
    case "RENT":
      return price ? `Rent ${price}` : "Rent";
    case "BUY":
      return price ? `Buy ${price}` : "Buy";
    case "CINEMA":
      return "In cinemas";
    default:
      return price || monetization;
  }
}

/** Collapse SD/HD/4K + rent/buy duplicates to one best offer per provider per country. */
export function collapseOffers(country: string, offers: unknown): WatchLink[] {
  if (!Array.isArray(offers)) return [];
  const best = new Map<string, { rank: number; link: WatchLink }>();
  for (const o of offers) {
    if (!isRecord(o) || typeof o.standardWebURL !== "string" || !o.standardWebURL) continue;
    const pkg = isRecord(o.package) ? o.package : null;
    const provider = pkg && typeof pkg.clearName === "string" ? pkg.clearName : null;
    const monetization = typeof o.monetizationType === "string" ? o.monetizationType : "";
    if (!provider) continue;
    if (PHYSICAL_NAME.test(provider)) continue;
    if (typeof o.presentationType === "string" && PHYSICAL_PRESENTATION.has(o.presentationType)) continue;
    const rank = MONETIZATION_RANK[monetization] ?? 9;
    const existing = best.get(provider);
    if (existing && existing.rank <= rank) continue;
    best.set(provider, {
      rank,
      link: {
        country,
        provider,
        link: cleanDeepLink(o.standardWebURL),
        price: priceLabel(monetization, o.retailPrice),
        monetization,
      },
    });
  }
  // "Prime Video" and "Prime Video with Ads" share one deep link — keep the best-ranked.
  const seen = new Set<string>();
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((b) => b.link)
    .filter((l) => (seen.has(l.link) ? false : (seen.add(l.link), true)));
}

export async function fetchJustWatch(input: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  countries: string[];
}): Promise<{
  status: SourceStatus;
  data?: { links: WatchLink[]; countries: string[]; justwatchId: string };
  detail?: string;
}> {
  const objectType = input.mediaType === "tv" ? "SHOW" : "MOVIE";
  const titles = [...new Set([input.title, input.originalTitle].filter((t): t is string => !!t))];
  // Search catalogs are per-country; try the first requested country, then US.
  const searchCountries = [...new Set([input.countries[0] ?? "US", "US"])];
  let nodeId: string | null = null;
  outer: for (const q of titles) {
    for (const c of searchCountries) {
      const data = await gql(SEARCH_QUERY, { q, c, l: "en", t: [objectType] });
      nodeId = pickNode(data, input.tmdbId);
      if (nodeId) break outer;
    }
  }
  if (!nodeId) return { status: "not_found", detail: "no justwatch title with matching tmdb id" };

  const data = await gql(offersQuery(input.countries), { id: nodeId, l: "en" });
  const node = isRecord(data.node) ? data.node : null;
  if (!node) throw new SourceError("parse_error", "offers node missing", 200, ENDPOINT);
  const links = input.countries.flatMap((c) => collapseOffers(c, node[c]));
  return {
    status: links.length > 0 ? "ok" : "empty",
    data: { links, countries: input.countries, justwatchId: nodeId },
    detail: `${links.length} links`,
  };
}
