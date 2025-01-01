import { stripLogos } from "~/server/utils/logos";

export default defineEventHandler(async () => {
  try {
    const { allItems, movies, tv, streamingNow }: any = await $fetch(`/api/trending/trendingTmdb`);
    const allItemsMovies = allItems.filter((item: any) => item.media_type === 'movie');
    const allItemsTv = allItems.filter((item: any) => item.media_type === 'tv');

    const movieIdsToFetchFullData = allItemsMovies.map((item: any) => item.id).filter(Boolean);
    movieIdsToFetchFullData.push(...streamingNow.map((item: any) => item.id).filter(Boolean));
    const allItemMoviefullInfo = await $fetch(`/api/movie/getMultiple?movieIds=${
      movieIdsToFetchFullData.join(',')}`);
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
      }).map(({id, media_type, title, name, backdrop_path, vote_count, vote_average, googleData, genres, images, genre_ids,
        popularity, homepage }: any) => ({
        id,
        media_type,
        popularity,
        title,
        name,
        backdrop_path,
        vote_average,
        vote_count,
        genres,
        genre_ids,
        googleData,
        images,
        homepage,
      })).map((item: any) => stripLogos(item)).filter((item: any) => item.backdrop_path && item.vote_count > 10),
      movies: movies.map(({id, title, poster_path, vote_average }: any) => ({
        id,
        title,
        poster_path,
        vote_average,
      })),
      tv: tv.map(({id, name, poster_path }: any) => ({
        id,
        name,
        poster_path,
      })),
      streamingNow: streamingNow.map((movie: any) => ({
          ...(allItemMoviefullInfo.find((fullMovie: any) => fullMovie.id === movie.id) || {}) as any,
          ...movie,
      })).map((item: any) => stripLogos(item)),
    }
  } catch (event: any) {
    console.error(event);
    return {
      error: event.message,
    }
  }
});
