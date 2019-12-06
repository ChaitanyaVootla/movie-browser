import { movieParams, seriesParams } from './discoverParams';

export const appConfig = {
    token: '40d0d5cd9342dfe3e629ea9a7daa4f23',
    apiBaseUrl: 'https://api.themoviedb.org/3/',
};

export const endpoints = {
    configuration: 'configuration',
    trendingTvList: 'trending/tv/day',
    trendingMoviesList: 'trending/movie/day',
    trendingPeopleList: 'trending/person/day',
    movieDetails: 'movie/',
    personDetails: 'person/',
    tvDetails: 'tv/',
    movieGenre: 'genre/movie/list',
    seriesGenre: 'genre/tv/list',
    discoverMovies: 'discover/movie',
    discoverSeries: 'discover/tv',
    searchMovies: 'search/movie'
};

export const discoverDefaultQueries = '&include_video=true&vote_count.gte=10&vote_average.gte=1&';
export const searchDefaultQueries = '&include_video=true';
export const latestMovieQuery = '&sort_by=release_date.desc&include_video=true&vote_count.gte=5&vote_average.gte=1';
export const personDetailsDefaultQuery = '&append_to_response=images,combined_credits,external_ids';
export const detailsDefaultQuery = '&append_to_response=videos,images,credits,similar,recommendations';

export { movieParams, seriesParams };