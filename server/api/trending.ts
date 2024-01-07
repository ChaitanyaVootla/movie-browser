export default defineEventHandler(async (event) => {
  try {
    const [{ results: allItems }, { results: movies }, { results: tv }, { results: streamingNow}] = (await Promise.all([
      $fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`),
      $fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY
        }&watch_region=IN&with_watch_monetization_types=free|flatrate|buy|rent|ads`),
    ])) as any[];
    const allItemsMovies = allItems.filter((item: any) => item.media_type === 'movie');
    const allItemsTv = allItems.filter((item: any) => item.media_type === 'tv');
    const allItemMoviefullInfo = await $fetch(`/api/movie/getMultiple?movieIds=${
        allItemsMovies.map((item: any) => item.id).filter(Boolean).join(',')}`);
    const allItemTvfullInfo = await $fetch(`/api/series/getMultiple?seriesIds=${
        allItemsTv.map((item: any) => item.id).filter(Boolean).join(',')}`);

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
      })
      .map(({id, media_type, title, name, backdrop_path, vote_average, googleData, genres, images, genre_ids }: any) => ({
        id,
        media_type,
        title,
        name,
        backdrop_path,
        vote_average,
        genres,
        genre_ids,
        googleData,
        images,
      }))
      ,
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
