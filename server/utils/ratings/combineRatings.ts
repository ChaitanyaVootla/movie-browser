interface LegacyRating {
    rating: string;
    name: string;
    link: string;
}

interface DetailedImdbData {
    rating: number | null;
    ratingCount: number | null;
    sourceUrl?: string;
    error?: string | null;
}

interface DetailedRtCriticData {
    score: number | null;
    ratingCount: number | null;
    certified: boolean | null;
    sentiment: string | null;
    consensus?: string | null;
}

interface DetailedRtAudienceData {
    score: number | null;
    ratingCount: number | null;
    certified: boolean | null;
    sentiment: string | null;
    consensus?: string | null;
}

interface DetailedRtData {
    critic: DetailedRtCriticData | null;
    audience: DetailedRtAudienceData | null;
    sourceUrl?: string;
    error?: string | null;
}

interface CombinedRating {
    rating: string;
    name: string;
    link: string;
    ratingCount?: number;
    certified?: boolean;
    sentiment?: string;
    consensus?: string;
}

/**
 * Normalize rating to scale of 100 based on the source
 */
const normalizeRating = (rating: number, source: string): number => {
    const sourceLower = source.toLowerCase();
    
    // Handle sources that are 0-10 scale
    if (sourceLower.includes('imdb') || sourceLower.includes('tmdb')) {
        return rating * 10; // Convert 0-10 to 0-100
    }
    
    // Handle sources that are already 0-100 scale
    if (sourceLower.includes('rotten') || 
        sourceLower.includes('metacritic') || 
        sourceLower.includes('prime') ||
        sourceLower.includes('google') ||
        sourceLower.includes('netflix') ||
        sourceLower.includes('hulu') ||
        sourceLower.includes('disney') ||
        sourceLower.includes('hbo') ||
        sourceLower.includes('paramount') ||
        sourceLower.includes('peacock') ||
        sourceLower.includes('apple') ||
        sourceLower.includes('amazon')) {
        return rating; // Already 0-100
    }
    
    // Default: assume it's already 0-100 scale
    return rating;
};

/**
 * Combine ratings from googleData and external_data into a unified format
 */
export const combineRatings = (
    googleData: any,
    externalData: any,
    tmdbRating?: number,
    tmdbVoteCount?: number,
    itemId?: number,
    mediaType?: 'movie' | 'tv'
): CombinedRating[] => {
    const combinedRatings: CombinedRating[] = [];
    const addedSources = new Set<string>();

    // Add TMDB rating first (highest priority)
    if (tmdbRating && itemId && mediaType) {
        const normalizedRating = Math.round(normalizeRating(tmdbRating, 'TMDB'));
        const tmdbUrl = `https://www.themoviedb.org/${mediaType}/${itemId}`;
        
        combinedRatings.push({
            rating: normalizedRating.toString(),
            name: 'TMDB',
            link: tmdbUrl,
            ratingCount: tmdbVoteCount || undefined,
        });
        addedSources.add('tmdb');
    }

    // Process external_data ratings first (more detailed)
    if (externalData?.ratings) {
        // IMDb from external_data
        if (externalData.ratings.imdb && externalData.ratings.imdb.rating) {
            const imdbData = externalData.ratings.imdb;
            const normalizedRating = Math.round(normalizeRating(imdbData.rating, 'IMDb'));
            combinedRatings.push({
                rating: normalizedRating.toString(),
                name: 'IMDb',
                link: imdbData.sourceUrl || '',
                ratingCount: imdbData.ratingCount || undefined,
            });
            addedSources.add('imdb');
        }

        // Rotten Tomatoes Critic from external_data
        if (externalData.ratings.rottenTomatoes?.critic && externalData.ratings.rottenTomatoes.critic.score) {
            const rtCritic = externalData.ratings.rottenTomatoes.critic;
            const normalizedRating = Math.round(normalizeRating(rtCritic.score, 'Rotten Tomatoes'));
            combinedRatings.push({
                rating: normalizedRating.toString(),
                name: 'Rotten Tomatoes',
                link: externalData.ratings.rottenTomatoes.sourceUrl || '',
                ratingCount: rtCritic.ratingCount || undefined,
                certified: rtCritic.certified || undefined,
                sentiment: rtCritic.sentiment || undefined,
                consensus: rtCritic.consensus || undefined,
            });
            addedSources.add('rotten tomatoes');
        }

        // Rotten Tomatoes Audience from external_data (new option)
        if (externalData.ratings.rottenTomatoes?.audience && externalData.ratings.rottenTomatoes.audience.score) {
            const rtAudience = externalData.ratings.rottenTomatoes.audience;
            const normalizedRating = Math.round(normalizeRating(rtAudience.score, 'Rotten Tomatoes (Audience)'));
            combinedRatings.push({
                rating: normalizedRating.toString(),
                name: 'Rotten Tomatoes (Audience)',
                link: externalData.ratings.rottenTomatoes.sourceUrl || '',
                ratingCount: rtAudience.ratingCount || undefined,
                certified: rtAudience.certified || undefined,
                sentiment: rtAudience.sentiment || undefined,
                consensus: rtAudience.consensus || undefined,
            });
            addedSources.add('rotten tomatoes audience');
        }
    }

    // Process googleData ratings (fallback for missing sources and additional sources)
    if (googleData?.ratings) {
        for (const rating of googleData.ratings) {
            const sourceName = rating.name.toLowerCase();
            
            // Skip if we already have this source from external_data
            if (sourceName.includes('imdb') && addedSources.has('imdb')) continue;
            if (sourceName.includes('rotten') && addedSources.has('rotten tomatoes')) continue;
            
            // Add ALL sources from googleData (IMDb, RT, Metacritic, Prime Video, Google, etc.)
            // Parse the rating string to get the numeric value
            const ratingString = rating.rating.replace('%', '');
            const ratingNumber = parseFloat(ratingString);
            
            // Only add if we can parse a valid number
            if (!isNaN(ratingNumber)) {
                const normalizedRating = Math.round(normalizeRating(ratingNumber, rating.name));
                
                combinedRatings.push({
                    rating: normalizedRating.toString(),
                    name: rating.name,
                    link: rating.link,
                });
            }
        }
    }

    return combinedRatings;
};
