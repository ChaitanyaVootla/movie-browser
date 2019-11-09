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
    tvDetails: 'tv/',
    movieGenre: 'genre/movie/list',
    discoverMovies: 'discover/movie',
    searchMovies: 'search/movie'
};

export const discoverDefaultQueries = '&include_adult=true&include_video=true&vote_count.gte=20';
export const searchDefaultQueries = '&include_adult=true&include_video=true';
