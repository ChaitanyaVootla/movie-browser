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
  googleData: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> } | undefined
): WatchOption[] {
  if (!googleData?.allWatchOptions?.length) {
    return [];
  }

  const options: WatchOption[] = [];
  const seenNames = new Set<string>();
  const seenLinks = new Set<string>();

  for (const opt of googleData.allWatchOptions) {
    if (!opt.name || seenNames.has(opt.name) || seenLinks.has(opt.link)) {
      continue;
    }

    const mapped = mapWatchProvider(opt.name, opt.link);
    if (!mapped) {
      continue;
    }

    seenNames.add(opt.name);
    seenLinks.add(opt.link);

    options.push({
      name: opt.name,
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
  countryCode: string
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

/**
 * Get watch options for a specific country with fallback logic
 *
 * @param countryCode - User's country code (e.g., "IN", "US")
 * @param googleData - Scraped watch data (only valid for India)
 * @param watchProviders - TMDB watch providers by country
 */
export function getWatchOptionsForCountry(
  countryCode: string,
  googleData: { allWatchOptions?: Array<{ name: string; link: string; price?: string }> } | undefined,
  watchProviders: Record<string, WatchProviderData> | undefined
): ProcessedWatchOptions {
  const normalizedCode = countryCode?.toUpperCase() || "IN";

  // For India: prefer scraped data if available
  if (normalizedCode === "IN") {
    const scraped = processScrapedWatchOptions(googleData);
    if (scraped.length > 0) {
      return {
        options: scraped,
        sourceCountry: "IN",
        isFromFallback: false,
      };
    }
  }

  // Try TMDB providers for the requested country
  if (watchProviders?.[normalizedCode]) {
    const options = normalizeTMDBWatchProviders(watchProviders[normalizedCode], normalizedCode);
    if (options.length > 0) {
      return {
        options,
        sourceCountry: normalizedCode,
        isFromFallback: false,
      };
    }
  }

  // Fallback to major countries
  for (const fallbackCode of FALLBACK_COUNTRIES) {
    if (fallbackCode === normalizedCode) continue;

    // For India fallback, try scraped data
    if (fallbackCode === "IN") {
      const scraped = processScrapedWatchOptions(googleData);
      if (scraped.length > 0) {
        return {
          options: scraped,
          sourceCountry: "IN",
          isFromFallback: true,
        };
      }
    }

    // Try TMDB providers
    if (watchProviders?.[fallbackCode]) {
      const options = normalizeTMDBWatchProviders(watchProviders[fallbackCode], fallbackCode);
      if (options.length > 0) {
        return {
          options,
          sourceCountry: fallbackCode,
          isFromFallback: true,
        };
      }
    }
  }

  // No options found
  return {
    options: [],
    sourceCountry: normalizedCode,
    isFromFallback: false,
  };
}

// Common countries to include in API response for client-side country switching
const COMMON_COUNTRIES = [
  "US", "GB", "IN", "CA", "AU", "DE", "FR", "JP", "KR", "BR", 
  "MX", "ES", "IT", "NL", "SE"
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

