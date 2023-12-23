export default defineEventHandler(async (event) => {
    const [{ results: allItems }, { results: movies }, { results: tv }] = (await Promise.all([
      $fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`),
    ])) as any[];
    const allItemsMovies = allItems.filter((item: any) => item.media_type === 'movie');
    const allItemsTv = allItems.filter((item: any) => item.media_type === 'tv');
    const allItemMoviefullInfo = await $fetch(`/api/movie/getMultiple?movieIds=${allItemsMovies.map((item: any) => item.id).filter(Boolean).join(',')}`);
    const allItemTvfullInfo = await $fetch(`/api/series/getMultiple?seriesIds=${allItemsTv.map((item: any) => item.id).filter(Boolean).join(',')}`);

    return {
      allItems: allItems.map((item: any) => {
        if (item.media_type === 'movie') {
          return {
            ...(allItemMoviefullInfo.find((movie: any) => movie.id === item.id) || {}) as any,
            ...item,
          }
        } else {
          return {
            ...(allItemTvfullInfo.find((tv: any) => tv.id === item.id) || {}) as any,
            ...item,
          }
        }
      }),
      movies,
      tv,
    }
});
