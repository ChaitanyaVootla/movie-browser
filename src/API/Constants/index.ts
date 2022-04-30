import { movieParams, seriesParams } from './discoverParams';

export const appConfig = {
    token: process.env.VUE_APP_API_KEY,
    apiBaseUrl: 'https://api.themoviedb.org/3/',
    serverBaseUrl: process.env.VUE_APP_SERVER_URL || 'http://localhost:3000/',
};

export const endpoints = {
    configuration: 'configuration',
    trendingTvList: 'trending/tv/day',
    trendingMoviesList: 'trending/movie/week',
    trendingListWeek: 'trending/all/week',
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

export const discoverDefaultQueries = '&include_video=true&vote_count.gte=10&';
export const searchDefaultQueries = '&include_video=true';
export const latestMovieQuery = '&sort_by=release_date.desc&include_video=true&vote_count.gte=5&vote_average.gte=1';
export const personDetailsDefaultQuery = '&append_to_response=images,combined_credits,external_ids';
export const detailsDefaultQuery = '&append_to_response=videos,images,credits,similar,recommendations,keywords';

export { movieParams, seriesParams, serverEndpoints };
