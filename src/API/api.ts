import {
    appConfig,
    endpoints,
    discoverDefaultQueries,
    searchDefaultQueries,
    latestMovieQuery,
    personDetailsDefaultQuery,
    detailsDefaultQuery,
    serverEndpoints,
} from './Constants';
import axios from 'axios';

const showAllResults = () => localStorage.getItem('showAllResults') || false;

export const api = {
    getUser: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}user`, { withCredentials: true });
        return res.data;
    },
    getLoadData: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}loadData`, { withCredentials: true });
        return res.data;
    },
    signOutOneTap: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}logout`, { withCredentials: true });
        return res.data;
    },
    addWatched: async function (id: number) {
        const res = await axios.post(`${appConfig.serverBaseUrl}watchedMovies/${id}`, {}, { withCredentials: true });
        return res.data;
    },
    getTrendingTv: async function () {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.trendingTvList}`);
        return res.data;
    },
    getTrendingMovies: async function () {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.trendingMoviesList}`
        );
        return res.data;
    },
    getTrendingListWeek: async function () {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.trendingListWeek}`
        );
        return res.data;
    },
    getTrendingPeople: async function () {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.trendingPeopleList}`,
        );
        return res.data;
    },
    getLatestMovies: async function (query: string = '') {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.discoverMovies}?${latestMovieQuery}${query}`,
        );
        return res.data;
    },
    getNowPlayingMovies: async function (query: string = '') {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.nowPlayingMovies}?${latestMovieQuery}${query}`,
        );
        return res.data;
    },
    getMovieDetails: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseUrl}${serverEndpoints.movieDetails}/${id}`,
        );
        return details;
    },
    collectionDetails: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.collectionDetails}${id}`,
        );
        return details;
    },
    releaseDates: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}movie/${id}/release_dates`,
        );
        return details;
    },
    getTvDetails: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseUrl}${serverEndpoints.tvDetails}/${id}?`,
        );
        return details;
    },
    getSeasonDetails: async function (seriesId: number, seasonNumber: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${seriesId}/season/${seasonNumber}`,
        );
        return details;
    },
    getEpisodeImages: async function (seriesId: number, seasonNumber: number, episodeNumber: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${seriesId}/season/${seasonNumber
                }/episode/${episodeNumber}/images`,
        );
        return details;
    },
    getPersonDetails: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.personDetails}${id}?${personDetailsDefaultQuery}`,
        );
        return details;
    },
    getMovieCredits: async function (id: number) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.movieDetails}${id}/credits`,
        );
        return res.data;
    },
    getTvCredits: async function (id: number) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${id}/credits`,
        );
        return res.data;
    },
    searchMovies: async function (searchString: string, page: number) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.searchMovies}?${searchQuery}&page=${page}`,
        );
        return res.data;
    },
    searchAll: async function (searchString: string, page: number) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.searchAll}?${searchQuery}&page=${page
                }&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    searchPeople: async function (searchString: string) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.searchPeople}?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getDiscoverMovies: async function (searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.discoverMovies}?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getDiscoverMoviesFull: async function (searchQuery: string) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.discoverMovies}?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getDiscoverSeries: async function (searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.discoverSeries}?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getTopSeriesByNetwork: async function (networkId: number) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.discoverSeries}?&with_networks=${networkId}`,
        );
        return res.data;
    },
    getCurrentStreamingSeries: async function () {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.currentStreamingTv}`,
        );
        return res.data;
    },
    getNetworkImages: async function (id: number) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.networkDetails}/${id}/images`,
        );
        return res.data;
    },
    searchKeywords: async function (query: string) {
        const res = await axios.get(appConfig.serverBaseUrl + `${serverEndpoints.keywords}?q=${query}`);
        return res.data;
    },
    getOTTLink: async function (query: string) {
        const res = await axios.get(appConfig.serverBaseUrl + `${serverEndpoints.ottLink}?q=${query}`);
        return res.data;
    },
};
