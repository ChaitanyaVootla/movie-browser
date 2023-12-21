export default defineEventHandler(async (event) => {
    const [{ results: movies }, { results: tv }] = (await Promise.all([
      $fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`),
    ])) as any[];
    return {
      movies,
      tv,
    }
});