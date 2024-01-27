export default defineEventHandler(async (event) => {
    try {
      const [{ results: allItems }, { results: movies }, { results: tv }, { results: streamingNow}] = (await Promise.all([
        $fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 5
        }),
        $fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 5
        }),
        $fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`, {
          retry: 5
        }),
        $fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY
          }&watch_region=IN&with_watch_monetization_types=free|flatrate|buy|rent|ads`, {
            retry: 5
        }),
      ])) as any[];
      return {
        allItems,
        movies,
        tv,
        streamingNow,
      }
    } catch (event: any) {
      console.error(event);
      return {
        error: event.message,
      }
    }
});
