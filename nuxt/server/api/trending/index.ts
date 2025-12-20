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

    const mappedAllItems = allItems.map((item: any) => {
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
    }).map(({id, media_type, title, name, backdrop_path, vote_count, vote_average, googleData, ratings, genres, images, genre_ids,
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
      ratings,
      images,
      homepage,
    })).map((item: any) => stripLogos(item)).filter((item: any) => item.backdrop_path && item.vote_count > 10)

    return {
      allItems: mappedAllItems,
      movies: movies.map((movie: any) => {
        const fullInfo: any = allItemMoviefullInfo.find((fullMovie: any) => fullMovie.id === movie.id) || {};
        return {
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          vote_average: movie.vote_average,
          // Add essential properties for PosterCard compatibility
          media_type: 'movie',
          popularity: movie.popularity || 0,
          backdrop_path: movie.backdrop_path || fullInfo.backdrop_path,
          vote_count: movie.vote_count || fullInfo.vote_count || 0,
          genres: fullInfo.genres || [],
          genre_ids: movie.genre_ids || [],
          googleData: fullInfo.googleData,
          ratings: fullInfo.ratings,
          images: fullInfo.images,
          homepage: fullInfo.homepage,
        };
      }),
      tv: tv.map((series: any) => {
        const fullInfo: any = allItemTvfullInfo.find((fullSeries: any) => fullSeries.id === series.id) || {};
        return {
          id: series.id,
          name: series.name,
          poster_path: series.poster_path,
          vote_average: series.vote_average || fullInfo.vote_average || 0,
          // Add essential properties for PosterCard compatibility
          media_type: 'tv',
          popularity: series.popularity || 0,
          backdrop_path: series.backdrop_path || fullInfo.backdrop_path,
          vote_count: series.vote_count || fullInfo.vote_count || 0,
          genres: fullInfo.genres || [],
          genre_ids: series.genre_ids || [],
          googleData: fullInfo.googleData,
          ratings: fullInfo.ratings,
          images: fullInfo.images,
          homepage: fullInfo.homepage,
        };
      }),
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
