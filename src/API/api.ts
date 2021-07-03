import {
    appConfig,
    endpoints,
    discoverDefaultQueries,
    searchDefaultQueries,
    latestMovieQuery,
    personDetailsDefaultQuery,
    detailsDefaultQuery,
    serverEndpoints
} from './Constants';
import axios from 'axios';

export const api = {
    getTrendingTv: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingTvList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingMovies: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingMoviesList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingListWeek: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingListWeek + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingPeople: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingPeopleList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getLatestMovies: async function(query: string = '') {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + latestMovieQuery + query);
        return res.data;
    },
    getNowPlayingMovies: async function(query: string = '') {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.nowPlayingMovies + '?api_key=' + appConfig.token + latestMovieQuery + query);
        return res.data;
    },
    getMovieDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.movieDetails + id +
            '?&api_key=' + appConfig.token + detailsDefaultQuery);
        return details;
    },
    collectionDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.collectionDetails + id +
            '?&api_key=' + appConfig.token);
        return details;
    },
    releaseDates: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + `movie/${id}/release_dates` +
            '?&api_key=' + appConfig.token);
        return details;
    },
    getTvDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + id +
            '?&api_key=' + appConfig.token + detailsDefaultQuery);
        return details;
    },
    getSeasonDetails: async function(seriesId: number, seasonNumber: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + seriesId + `/season/${seasonNumber}` +
            '?&api_key=' + appConfig.token);
        return details;
    },
    getEpisodeImages: async function(seriesId: number, seasonNumber: number, episodeNumber: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + seriesId + `/season/${seasonNumber}/episode/${episodeNumber}/images` +
            '?&api_key=' + appConfig.token);
        return details;
    },
    getPersonDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.personDetails + id + '?&api_key=' + appConfig.token + personDetailsDefaultQuery);
        return details;
    },
    getMovieCredits: async function(id: number) {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.movieDetails + id + '/credits?api_key=' + appConfig.token);
        return res.data;
    },
    getTvCredits: async function(id: number) {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + id + '/credits?api_key=' + appConfig.token);
        return res.data;
    },
    getConfiguration: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.configuration + '?api_key=' + appConfig.token);
        return res.data;
    },
    getMovieGenres: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.movieGenre + '?api_key=' + appConfig.token);
        return res.data.genres;
    },
    getSeriesGenres: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.seriesGenre + '?api_key=' + appConfig.token);
        return res.data.genres;
    },
    searchMovies: async function(searchString: string, page: number) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.searchMovies + '?api_key=' + appConfig.token + searchQuery + '&page=' + page);
        return res.data;
    },
    searchAll: async function(searchString: string, page: number) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.searchAll + '?api_key=' + appConfig.token + searchQuery + '&page=' + page);
        return res.data;
    },
    searchPeople: async function(searchString: string) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.searchPeople + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getDiscoverMovies: async function(searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getDiscoverMoviesFull: async function(searchQuery: string) {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getDiscoverSeries: async function(searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverSeries + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getTopSeriesByNetwork: async function(networkId: number) {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverSeries + '?api_key=' + appConfig.token + `&with_networks=${networkId}`);
        return res.data;
    },
    getCurrentStreamingSeries: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.currentStreamingTv + '?api_key=' + appConfig.token);
        return res.data;
    },
    getNetworkImages: async function(id: number) {
        const res = await axios.get(appConfig.apiBaseUrl +`${endpoints.networkDetails}/${id}/images` + '?api_key=' + appConfig.token);
        return res.data;
    },
    searchKeywords: async function(query: string) {
        const res = await axios.get(appConfig.serverBaseUrl +`${serverEndpoints.keywords}?q=${query}`);
        return res.data;
    },
    getOTTLink: async function(query: string) {
        const res = await axios.get(appConfig.newServerBaseUrl +`${serverEndpoints.ottLink}?q=${query}`);
        return res.data;
    },
};
