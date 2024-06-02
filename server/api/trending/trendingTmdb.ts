import { movieGetHandler } from "../movie/[movieId]";
import { seriesGetHandler } from "../series/[seriesId]";

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
      const allItemsMovies = allItems.filter((item: any) => item.media_type === 'movie');
      const allItemsTv = allItems.filter((item: any) => item.media_type === 'tv');
      updateMovies(allItemsMovies.map((item: any) => item.id).filter(Boolean));
      updateSeries(allItemsTv.map((item: any) => item.id).filter(Boolean));
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

const updateMovies = async (movieIds: string[]) => {
  console.log("Updating trending movies")
  for (const movieId of movieIds) {
    await movieGetHandler(movieId, false, false, true);
  }
  console.log("Updated trending movies")
}

const updateSeries = async (seriesIds: string[]) => {
  console.log("Updating trending series")
  for (const seriesId of seriesIds) {
    await seriesGetHandler(seriesId, false, false, true);
  }
  console.log("Updated trending series")
}
