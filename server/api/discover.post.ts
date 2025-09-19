import { Movie, MovieLightFileds, Series, SeriesLightFileds } from "../models";
import { getObjectSha } from "../utils/crypto";

export default defineEventHandler(async (event) => {
    const params = getQuery(event);
    const query = await readBody(event);
    if (!query || !query?.media_type) {
        return [];
    }

    // Check if the request is cached
    const cacheKey = getObjectSha({...query, ...params});
    const cachedData = await useStorage('discovery').getItem(cacheKey);
    if (cachedData) {
        console.log(`✅ Cache hit for discovery query: ${cacheKey.substring(0, 8)}...`);
        return cachedData;
    }
    console.log(`🔄 Cache miss for discovery query: ${cacheKey.substring(0, 8)}...`);

    const queryStr = Object.keys(query)
        .map((key) => {
            const value = query[key];
            if (key === 'with_watch_providers') {
                return `${key}=${value.join('|')}`
            }
            if (key === 'with_keywords') {
                return `${key}=${value.join('|')}`
            }
            return value?`${key}=${value}`:null
        })
        .filter(Boolean)
        .join('&');

    try {
        const tmdbRes: any = await $fetch(`https://api.themoviedb.org/3/discover/${query.media_type}?api_key=${process.env.TMDB_API_KEY
            }&${queryStr}`, {
                retry: 5,
                timeout: 15000  // 15 second timeout
            });
            
        if (!tmdbRes || !tmdbRes.results) {
            console.error('❌ Invalid TMDB discover response structure');
            return { results: [], total_pages: 0, total_results: 0 };
        }
        
        if (params.getFullData) {
            const itemIds = tmdbRes.results.map((movie: any) => movie.id);
            let fullDataRes = [] as any[];
            if (query.media_type === 'tv') {
                fullDataRes = await Series.find({id: {$in: itemIds}}).select(SeriesLightFileds);
            } else {
                fullDataRes = await Movie.find({id: {$in: itemIds}}).select(MovieLightFileds);
            }
            const fullDataItems = fullDataRes.map(movie => movie.toJSON());
            const mappedResults = tmdbRes.results.map((originalItem: any) => {
                return {
                    ...fullDataItems.find((item: any) => item.id === originalItem.id),
                    ...originalItem
                };
            })
            return {
                ...tmdbRes,
                results: mappedResults
            }
        }
        
        // Cache the result with TTL (1 hour)
        await useStorage('discovery').setItem(cacheKey, tmdbRes, { ttl: 60 * 60 });
        console.log(`💾 Cached discovery result: ${cacheKey.substring(0, 8)}... for 1 hour`);
        
        return tmdbRes;
        
    } catch (error: any) {
        console.error('❌ TMDB discover API error:', {
            error: error.message,
            query: query.media_type,
            timestamp: new Date().toISOString()
        });
        
        // Return empty results structure to prevent frontend crashes
        return { 
            results: [], 
            total_pages: 0, 
            total_results: 0,
            error: error.message 
        };
    }
});