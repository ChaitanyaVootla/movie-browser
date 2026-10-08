/**
 * Watch Options Utilities
 *
 * Handles watch provider data from:
 * 1. Scraped data (from googleData) - only valid for India
 * 2. TMDB watch providers - for all countries
 *
 * Priority:
 * - For India: scraped data (if available) > TMDB India
 * - For other countries: TMDB for that country
 * - Fallback: major countries (US, GB, etc.) with indication
 */

import type { WatchProviderData } from "@/types";

// =============================================================================
// Types
// =============================================================================

export interface WatchOption {
  name: string;
  displayName: string;
  link: string;
  price: string;
  image: string;
  key: string;
  isJustWatch?: boolean; // True if from TMDB (no direct deep links)
}

export interface ProcessedWatchOptions {
  options: WatchOption[];
  sourceCountry: string; // Country code where these options are from
  isFromFallback: boolean; // True if showing options from a different country
}

// =============================================================================
// OTT Provider Image Mapping
// =============================================================================

export const OTT_PROVIDER_MAP: Record<
  string,
  { image: string; name: string; linkMorph?: (link: string) => string }
> = {
  youtube: { image: "/images/ott/youtube.png", name: "YouTube" },
  netflix: {
    image: "/images/ott/netflix.svg",
    name: "Netflix",
    linkMorph: (link) =>
      link.replace("https://www.netflix.com/title/", "https://www.netflix.com/watch/"),
  },
  apple: { image: "/images/ott/apple.png", name: "Apple" },
  google: { image: "/images/ott/google.svg", name: "Google" },
  amazon: { image: "/images/ott/prime.svg", name: "Amazon" },
  prime: { image: "/images/ott/prime.svg", name: "Amazon" },
  hotstar: { image: "/images/ott/hotstar.png", name: "Hotstar" },
  sonyliv: { image: "/images/ott/sonyliv.png", name: "SonyLIV" },
  voot: { image: "/images/ott/voot.png", name: "Voot" },
  zee5: { image: "/images/ott/zee.png", name: "Zee5" },
  jio: { image: "/images/ott/jio.png", name: "JioCinema" },
  mubi: { image: "/images/ott/mubi.webp", name: "MUBI" },
  mx: { image: "/images/ott/mx.png", name: "MX Player" },
  aha: { image: "/images/ott/aha.svg", name: "aha" },
  plex: { image: "/images/ott/plex.png", name: "Plex" },
  crunchyroll: { image: "/images/ott/crunchyroll.png", name: "Crunchyroll" },
  viki: { image: "/images/ott/viki.png", name: "Viki" },
};

// Fallback priority for countries when current country has no watch options
export const FALLBACK_COUNTRIES = ["US", "GB", "FR", "DE", "IN", "JP", "KR"];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract base URL from a link for provider matching
 */
function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

/**
 * Map a watch provider name/link to our known OTT providers
 */
export function mapWatchProvider(
  name: string,
  link: string
): { name: string; displayName: string; link: string; image: string; key: string } | null {
  const searchKey = (name || getBaseUrl(link)).toLowerCase();
  const entry = Object.entries(OTT_PROVIDER_MAP).find(([key]) => searchKey.includes(key));

  if (!entry) {
    return null;
  }

  const [key, config] = entry;
  const finalLink = config.linkMorph ? config.linkMorph(link) : link;

  return {
    name: name || config.name,
    displayName: config.name,
    link: finalLink,
    image: config.image,
    key,
  };
}

/**
 * Process scraped watch options from googleData (India only)
 */
export function processScrapedWatchOptions(
  googleData:
    | { allWatchOptions?: Array<{ name: string; link: string; price?: string }> }
    | undefined
): WatchOption[] {
  if (!googleData?.allWatchOptions?.length) {
    return [];
  }

  const options: WatchOption[] = [];
  const seenLinks = new Set<string>();

  for (const opt of googleData.allWatchOptions) {
    // Skip duplicates by link (primary deduplication key)
    if (!opt.link || seenLinks.has(opt.link)) {
      continue;
    }

    // mapWatchProvider handles empty names by using the link's base URL
    const mapped = mapWatchProvider(opt.name || "", opt.link);
    if (!mapped) {
      continue;
    }

    seenLinks.add(opt.link);

    options.push({
      name: opt.name || mapped.displayName, // Use mapped name if original is empty
      displayName: mapped.displayName,
      link: mapped.link,
      price: opt.price?.replace("Premium", "") || "",
      image: mapped.image,
      key: mapped.key,
      isJustWatch: false,
    });
  }

  // Sort: subscription first
  return options.sort((a, b) => {
    if (a.price?.toLowerCase().includes("subscription")) return -1;
    if (b.price?.toLowerCase().includes("subscription")) return 1;
    return 0;
  });
}

/**
 * Normalize TMDB watch providers for a single country
 */
export function normalizeTMDBWatchProviders(
  watchProviderData: WatchProviderData,
  _countryCode: string
): WatchOption[] {
  const providerMap = new Map<number, WatchOption>();

  // Process all provider types
  const types = {
    flatrate: watchProviderData.flatrate,
    rent: watchProviderData.rent,
    buy: watchProviderData.buy,
  } as const;

  for (const [type, providers] of Object.entries(types)) {
    if (!providers) continue;

    for (const provider of providers) {
      const existing = providerMap.get(provider.provider_id);

      if (existing) {
        // Append type to price
        existing.price = `${existing.price}, ${type}`;
      } else {
        // Create new entry
        providerMap.set(provider.provider_id, {
          name: provider.provider_name,
          displayName: provider.provider_name,
          image: `https://image.tmdb.org/t/p/w92${provider.logo_path}`,
          price: type,
          link: watchProviderData.link || "",
          key: provider.provider_id.toString(),
          isJustWatch: true,
        });
      }
    }
  }

  // Convert to array (flatrate providers will be first due to processing order)
  return Array.from(providerMap.values());
}

// PostgreSQL scraped links format (from scraped_watch_links table)
export type ScrapedWatchLinksMap = Record<
  string,
  Array<{ name: string; link: string; price?: string }>
>;

/**
 * Process scraped watch links from PostgreSQL (country-keyed format)
 */
export function processScrapedWatchLinksFromPostgres(
  scrapedLinks: ScrapedWatchLinksMap | undefined,
  countryCode: string
): WatchOption[] {
  const links = scrapedLinks?.[countryCode];
  if (!links?.length) return [];

  const options: WatchOption[] = [];
  const seenLinks = new Set<string>();

  for (const opt of links) {
    if (!opt.link || seenLinks.has(opt.link)) continue;

    const mapped = mapWatchProvider(opt.name || "", opt.link);
    if (!mapped) continue;

    seenLinks.add(opt.link);
    options.push({
      name: opt.name || mapped.displayName,
      displayName: mapped.displayName,
      link: mapped.link,
      price: opt.price?.replace("Premium", "") || "",
      image: mapped.image,
      key: mapped.key,
      isJustWatch: false,
    });
  }

  return options.sort((a, b) => {
    if (a.price?.toLowerCase().includes("subscription")) return -1;
    if (b.price?.toLowerCase().includes("subscription")) return 1;
    return 0;
  });
}

/** Provider-name key for matching scraped links to TMDB providers ("Disney Plus" ≈ "Disney+"). */
export function providerKey(name: string): string {
  return name.toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");
}

type LinkLike = { name: string; link: string; price?: string };

/**
 * Overlay scraped deep links onto TMDB's provider list for one country.
 *
 * TMDB's list is complete and carries logos, but every entry links to the
 * JustWatch landing page. The scraper (JustWatch GraphQL — the same data TMDB
 * shows, so names match) has the per-title deep link. Matching is by provider
 * name: exact key first, then prefix ("Apple TV" ↔ "Apple TV Store"). Scraped
 * links with no TMDB counterpart are appended only if we have an icon for them.
 */
export function mergeDeepLinks(tmdbOptions: WatchOption[], links: LinkLike[]): WatchOption[] {
  const all = links.filter((l) => l.link);
  const used = new Set<LinkLike>();
  const isPrefix = (a: string, b: string) =>
    a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a));

  const merged: WatchOption[] = [];
  for (const opt of tmdbOptions) {
    const key = providerKey(opt.name);
    const exact = all.find((l) => !used.has(l) && providerKey(l.name) === key);
    const prefix = exact ? undefined : all.find((l) => isPrefix(providerKey(l.name), key));
    const hit = exact ?? prefix;
    if (!hit) {
      merged.push(opt);
      continue;
    }
    // A plan variant ("Netflix Standard with Ads") whose deep link another entry
    // already carries is a duplicate button — drop it rather than show a worse link.
    if (used.has(hit)) continue;
    used.add(hit);
    const morph = mapWatchProvider(hit.name, hit.link);
    merged.push({
      ...opt,
      link: morph?.link ?? hit.link,
      price: hit.price?.replace("Premium", "") || opt.price,
      isJustWatch: false,
    });
  }
  const remaining = all.filter((l) => !used.has(l));
  const extras = processScrapedWatchLinksFromPostgres({ XX: remaining }, "XX").filter(
    (e) => !merged.some((m) => m.link === e.link)
  );
  // deep-linked entries first; stable otherwise (TMDB order = flatrate first)
  return [...merged.filter((m) => !m.isJustWatch), ...extras, ...merged.filter((m) => m.isJustWatch)];
}

/**
 * Get watch options for a specific country with fallback logic
 *
 * @param countryCode - User's country code (e.g., "IN", "US")
 * @param googleData - Legacy-shaped enrichment doc from `cached-queries`. Its
 *   `watchLinksByCountry` (all countries) is used when `scrapedWatchLinks` is
 *   not passed; `allWatchOptions` is the India-only legacy field.
 * @param watchProviders - TMDB watch providers by country
 * @param scrapedWatchLinks - Scraped deep links from PostgreSQL (country-keyed)
 */
export function getWatchOptionsForCountry(
  countryCode: string,
  googleData:
    | {
        allWatchOptions?: Array<{ name: string; link: string; price?: string }>;
        watchLinksByCountry?: ScrapedWatchLinksMap;
      }
    | undefined,
  watchProviders: Record<string, WatchProviderData> | undefined,
  scrapedWatchLinks?: ScrapedWatchLinksMap
): ProcessedWatchOptions {
  const normalizedCode = countryCode?.toUpperCase() || "IN";
  const scraped = scrapedWatchLinks ?? googleData?.watchLinksByCountry;

  const optionsFor = (code: string): WatchOption[] => {
    const links =
      scraped?.[code] ?? (code === "IN" ? googleData?.allWatchOptions : undefined) ?? [];
    const tmdb = watchProviders?.[code] ? normalizeTMDBWatchProviders(watchProviders[code], code) : [];
    if (links.length > 0 && tmdb.length > 0) return mergeDeepLinks(tmdb, links);
    if (links.length > 0) {
      const only = processScrapedWatchLinksFromPostgres({ [code]: links }, code);
      if (only.length > 0) return only;
    }
    return tmdb;
  };

  const primary = optionsFor(normalizedCode);
  if (primary.length > 0) {
    return { options: primary, sourceCountry: normalizedCode, isFromFallback: false };
  }

  for (const fallbackCode of FALLBACK_COUNTRIES) {
    if (fallbackCode === normalizedCode) continue;
    const options = optionsFor(fallbackCode);
    if (options.length > 0) {
      return { options, sourceCountry: fallbackCode, isFromFallback: true };
    }
  }

  return { options: [], sourceCountry: normalizedCode, isFromFallback: false };
}

// Common countries to include in API response for client-side country switching
const COMMON_COUNTRIES = [
  "US",
  "GB",
  "IN",
  "CA",
  "AU",
  "DE",
  "FR",
  "JP",
  "KR",
  "BR",
  "MX",
  "ES",
  "IT",
  "NL",
  "SE",
];

/**
 * Server-side: Process watch options for API response
 * Returns watch providers for common countries to support client-side country switching
 * This balances payload size with flexibility
 */
export function getOptimizedWatchProviders(
  countryCode: string,
  watchProviders: Record<string, WatchProviderData> | undefined
): Record<string, WatchProviderData> | undefined {
  if (!watchProviders) return undefined;

  const normalizedCode = countryCode?.toUpperCase() || "IN";
  const result: Record<string, WatchProviderData> = {};

  // Always include the user's detected country
  if (watchProviders[normalizedCode]) {
    result[normalizedCode] = watchProviders[normalizedCode];
  }

  // Include common countries that have providers
  for (const code of COMMON_COUNTRIES) {
    if (code !== normalizedCode && watchProviders[code]) {
      result[code] = watchProviders[code];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
