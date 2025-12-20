import { getLocationFromEvent } from "~/server/api/onLoad";
import { mapWatchProvider } from "~/utils/watchOptions";
import { getBaseUrl } from "~/utils/url";

export interface WatchOption {
    name: string;
    displayName: string;
    link: string;
    price: string;
    image: string;
    key: string;
    isJustWatch?: boolean;
}

export interface WatchProviderData {
    buy?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
        display_priority: number;
        link?: string;
    }>;
    rent?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
        display_priority: number;
        link?: string;
    }>;
    flatrate?: Array<{
        logo_path: string;
        provider_id: number;
        provider_name: string;
        display_priority: number;
        link?: string;
    }>;
    link?: string;
}

/**
 * Normalizes TMDB watch providers data for a single country
 */
export function normalizeWatchProviders(watchProviderData: WatchProviderData, countryCode: string): WatchOption[] {
    const providerMap = new Map<number, WatchOption>();

    // Process all provider types (buy, rent, flatrate)
    Object.entries({
        buy: watchProviderData.buy,
        rent: watchProviderData.rent,
        flatrate: watchProviderData.flatrate,
    }).forEach(([type, providers]) => {
        (providers || []).forEach((provider) => {
            const existingProvider = providerMap.get(provider.provider_id);

            if (existingProvider) {
                // Provider already exists, append the type to price
                existingProvider.price = `${existingProvider.price}, ${type}`;
            } else {
                // Create new provider entry
                const watchOption: WatchOption = {
                    name: provider.provider_name,
                    displayName: provider.provider_name,
                    image: `https://image.tmdb.org/t/p/w154${provider.logo_path}`,
                    price: type,
                    link: provider.link || watchProviderData.link || `https://www.themoviedb.org/movie/watch?locale=${countryCode}`,
                    key: provider.provider_id.toString(),
                    isJustWatch: true
                };

                providerMap.set(provider.provider_id, watchOption);
            }
        });
    });

    // Convert map to array and sort by display priority
    return Array.from(providerMap.values())
        .sort((a, b) => {
            const aProvider = [...(watchProviderData.buy || []), ...(watchProviderData.rent || []), ...(watchProviderData.flatrate || [])]
                .find(p => p.provider_id.toString() === a.key);
            const bProvider = [...(watchProviderData.buy || []), ...(watchProviderData.rent || []), ...(watchProviderData.flatrate || [])]
                .find(p => p.provider_id.toString() === b.key);

            return (aProvider?.display_priority || 0) - (bProvider?.display_priority || 0);
        });
}

/**
 * Maps Google watch options using the same logic as the UI
 */
function mapGoogleWatchOptions(googleWatchOptions: any[]): WatchOption[] {
    return googleWatchOptions.map((watchOption: any) => {
        const mappedWatchOption = mapWatchProvider(watchOption.name, watchOption.link);

        return {
            name: watchOption.name,
            displayName: mappedWatchOption?.displayName || watchOption.name,
            link: mappedWatchOption.link,
            price: watchOption.price?.replace('Premium', '') || '',
            image: mappedWatchOption?.image || watchOption.image || '',
            key: mappedWatchOption?.key || '',
            isJustWatch: false
        };
    }).sort((a: any, b: any) => {
        if (a.price?.toLowerCase().includes('subscription')) {
            return -1;
        } else if (b.price?.toLowerCase().includes('subscription')) {
            return 1;
        } else {
            return 0;
        }
    }).filter((watchOption: any) => watchOption.name);
}

/**
 * Gets watch options based on country and available data
 */
export function getWatchOptions(
    event: any,
    googleData: any,
    watchProviders: Record<string, WatchProviderData> | undefined
): WatchOption[] {
    const location = getLocationFromEvent(event);
    const countryCode = location.countryCode || 'IN';

    // If request is from India and we have googleData with watch options, use those
    if (countryCode === 'IN' && googleData?.allWatchOptions?.length > 0) {
        return mapGoogleWatchOptions(googleData.allWatchOptions);
    }

    // Otherwise, use TMDB watch providers for the specific country
    if (watchProviders && watchProviders[countryCode]) {
        return normalizeWatchProviders(watchProviders[countryCode], countryCode);
    }

    console.log("falling back to us", watchProviders?.['US'], countryCode)

    // Fallback to US if country not found
    if (watchProviders && watchProviders['US']) {
        return normalizeWatchProviders(watchProviders['US'], 'US');
    }

    return [];
}

