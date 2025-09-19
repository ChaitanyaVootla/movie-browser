import { movieGetHandler } from "../movie/[movieId]";
import { seriesGetHandler } from "../series/[seriesId]";

export default defineEventHandler(async (event) => {
    // Fast cache check first
    const cacheKey = 'trending-tmdb-data';
    const cachedData = await useStorage('trending').getItem(cacheKey);
    if (cachedData) {
        console.log('✅ Returning cached trending data');
        return cachedData;
    }

    try {
      console.log('🔄 Fetching fresh trending data...');
      const [{ results: allItems }, { results: movies }, { results: tv }, { results: streamingNow}] = (await Promise.all([
        $fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 3,
          timeout: 15000
        }),
        $fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 3,
          timeout: 15000
        }),
        $fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 3,
          timeout: 15000
        }),
        $fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY
          }&watch_region=IN&with_watch_monetization_types=free|flatrate|buy|rent|ads`, {
            retry: 3,
            timeout: 15000
        }),
      ])) as any[];

      const result = {
        allItems: allItems.filter((item: any) => ['movie', 'tv'].includes(item.media_type)),
        movies,
        tv,
        streamingNow,
      };

      // Cache the result for 30 minutes
      await useStorage('trending').setItem(cacheKey, result, { ttl: 30 * 60 });
      console.log('💾 Cached trending data for 30 minutes');

      // Trigger background updates (already non-blocking since no await)
      const allItemsMovies = allItems.filter((item: any) => item.media_type === 'movie');
      const allItemsTv = allItems.filter((item: any) => item.media_type === 'tv');
      
      // Original code - already runs in background without await
      updateMovies(allItemsMovies.map((item: any) => item.id).filter(Boolean));
      updateSeries(allItemsTv.map((item: any) => item.id).filter(Boolean));

      return result;
    } catch (error: any) {
      console.error('❌ Trending TMDB API error:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Return proper structure with empty arrays to prevent consumer crashes
      return {
        allItems: [],
        movies: [],
        tv: [],
        streamingNow: [],
        error: error.message
      };
    }
});

// Optimized functions - now use parallel processing instead of sequential
const updateMovies = async (movieIds: string[]) => {
  console.log("Updating trending movies")
  // Use parallel processing instead of sequential
  await Promise.allSettled(
    movieIds.map(movieId => movieGetHandler(movieId, true, false, true))
  );
  console.log("Updated trending movies")
}

const updateSeries = async (seriesIds: string[]) => {
  console.log("Updating trending series")
  // Use parallel processing instead of sequential
  await Promise.allSettled(
    seriesIds.map(seriesId => seriesGetHandler(seriesId, true, false, true))
  );
  console.log("Updated trending series")
}
