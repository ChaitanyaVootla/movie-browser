import { movieParams, seriesParams } from './discoverParams';

export const appConfig = {
    apiBaseUrl: 'https://api.themoviedb.org/3/',
    serverBaseUrl: process.env.VUE_APP_SERVER_URL || 'http://localhost:3000/',
    serverBaseTMDBUrl: (process.env.VUE_APP_SERVER_URL || 'http://localhost:3000/') + 'tmdb/',
};

export const endpoints = {
    configuration: 'configuration',
    trendingTvList: 'trending/tv/day',
    trendingMoviesList: 'trending/movie/day',
    trendingListWeek: 'trending/all/day',
    trendingPeopleList: 'trending/person/day',
    movieDetails: 'movie/',
    collectionDetails: 'collection/',
    personDetails: 'person/',
    tvDetails: 'tv/',
    movieGenre: 'genre/movie/list',
    seriesGenre: 'genre/tv/list',
    discoverMovies: 'discover/movie',
    nowPlayingMovies: 'movie/now_playing',
    discoverSeries: 'discover/tv',
    currentStreamingTv: 'tv/on_the_air',
    searchMovies: 'search/movie',
    searchAll: 'search/multi',
    searchPeople: 'search/person',
    networkDetails: 'network',
};

const serverEndpoints = {
    keywords: 'keywords',
    ottLink: 'googleData',
};

export const discoverDefaultQueries = '&include_video=true&';
export const searchDefaultQueries = '&include_video=true';
export const latestMovieQuery = '&sort_by=release_date.desc&include_video=true&vote_average.gte=1';
export const personDetailsDefaultQuery = '&append_to_response=images,combined_credits,external_ids';
export const detailsDefaultQuery =
    '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

export { movieParams, seriesParams, serverEndpoints };
