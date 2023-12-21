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
import Timezone from 'countries-and-timezones';
import Axios from 'axios';
const axios = Axios.create({ withCredentials: true });

const showAllResults = () => localStorage.getItem('showAllResults') || false;

export const api = {
    getStats: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}stats`);
        return res.data;
    },
    askAI: async function (message: string, threadId?: string) {
        const res = await axios.get(`${appConfig.serverBaseUrl}assistant?message=${message}${threadId?'&threadId='+threadId:''}`);
        return res.data;
    },
    getHistoricalMovieStats: async function (id: number) {
        const res = await axios.get(`${appConfig.serverBaseUrl}movieDetails/${id}/stats`);
        return res.data;
    },
    getHistoricalSeriesStats: async function (id: number) {
        const res = await axios.get(`${appConfig.serverBaseUrl}seriesDetails/${id}/stats`);
        return res.data;
    },
    getUser: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}user`);
        return res.data;
    },
    getUsers: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}users`);
        return res.data;
    },
    getLoadData: async function () {
        let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZone.includes('Calcutta')) {
            timeZone = timeZone.replace('Calcutta', 'Kolkata');
        }
        const country = Timezone.getCountryForTimezone(timeZone);
        const res = await axios.get(`${appConfig.serverBaseUrl}loadData?country=${country?.id}`);
        return res.data;
    },
    signOutOneTap: async function () {
        const res = await axios.get(`${appConfig.serverBaseUrl}logout`);
        return res.data;
    },
    addWatched: async function (id: number) {
        const res = await axios.post(`${appConfig.serverBaseUrl}watchedMovies/${id}`);
        return res.data;
    },
    addWatchedBulk: async function (bulk: any) {
        const res = await axios.post(`${appConfig.serverBaseUrl}watchedMoviesBulk`, bulk);
        return res.data;
    },
    deleteWatched: async function (id: number) {
        const res = await axios.delete(`${appConfig.serverBaseUrl}watchedMovies/${id}`);
        return res.data;
    },
    addWatchListMovie: async function (id: number) {
        const res = await axios.post(`${appConfig.serverBaseUrl}watchListMovie/${id}`);
        return res.data;
    },
    deleteWatchListMovie: async function (id: number) {
        const res = await axios.delete(`${appConfig.serverBaseUrl}watchListMovie/${id}`);
        return res.data;
    },
    addRecent: async function (itemId: number, isMovie: Boolean) {
        const res = await axios.post(`${appConfig.serverBaseUrl}recents`, { itemId, isMovie });
        return res.data;
    },
    addContinueWatching: async function (body) {
        const res = await axios.post(`${appConfig.serverBaseUrl}continueWatching`, body);
        return res.data;
    },
    addSeriesList: async function (id: number) {
        const res = await axios.post(`${appConfig.serverBaseUrl}seriesList/${id}`);
        return res.data;
    },
    removeSeriesList: async function (id: number) {
        const res = await axios.delete(`${appConfig.serverBaseUrl}seriesList/${id}`);
        return res.data;
    },
    getEpisode: async function (seriesId: number, seasonNumber: number, episodeNumber: number) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?append_to_response=images,external_ids,credits`,
        );
        return res.data;
    },
    getTrendingTv: async function () {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.trendingTvList}`);
        return res.data;
    },
    getTrendingMovies: async function () {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.trendingMoviesList}`);
        return res.data;
    },
    getTrendingListWeek: async function () {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.trendingListWeek}`);
        return res.data;
    },
    getTrendingPeople: async function () {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.trendingPeopleList}`);
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
    getMovieDetails: async function (id: number, query?: string) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseUrl}${serverEndpoints.movieDetails}/${id}?${query}`,
        );
        return details;
    },
    getMovieImages: async function (id: number) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${endpoints.movieDetails}/${id}/images`,
        );
        return details;
    },
    collectionDetails: async function (id: number) {
        const { data: details } = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.collectionDetails}${id}`);
        return details;
    },
    releaseDates: async function (id: number) {
        const { data: details } = await axios.get(`${appConfig.serverBaseTMDBUrl}movie/${id}/release_dates`);
        return details;
    },
    getTvDetails: async function (id: number, query?: string) {
        const { data: details } = await axios.get(
            `${appConfig.serverBaseUrl}${serverEndpoints.tvDetails}/${id}?${query}`,
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
            `${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${seriesId}/season/${seasonNumber}/episode/${episodeNumber}/images`,
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
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.movieDetails}${id}/credits`);
        return res.data;
    },
    getTvCredits: async function (id: number) {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.tvDetails}${id}/credits`);
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
            `${appConfig.serverBaseTMDBUrl}${
                endpoints.searchAll
            }?${searchQuery}&page=${page}&include_adult=${showAllResults()}`,
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
            `${appConfig.serverBaseTMDBUrl}${
                endpoints.discoverMovies
            }?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getDiscoverMoviesFull: async function (searchQuery: string) {
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${
                endpoints.discoverMovies
            }?${searchQuery}&include_adult=${showAllResults()}`,
        );
        return res.data;
    },
    getDiscoverSeries: async function (searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(
            `${appConfig.serverBaseTMDBUrl}${
                endpoints.discoverSeries
            }?${searchQuery}&include_adult=${showAllResults()}`,
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
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.currentStreamingTv}`);
        return res.data;
    },
    getNetworkImages: async function (id: number) {
        const res = await axios.get(`${appConfig.serverBaseTMDBUrl}${endpoints.networkDetails}/${id}/images`);
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
    createOrUpdateFilter: async function (filter: any) {
        const res = await axios.post(appConfig.serverBaseUrl + serverEndpoints.filters, filter);
        return res.data;
    },
    getFilters: async function () {
        const res = await axios.get(appConfig.serverBaseUrl + serverEndpoints.filters);
        return res.data;
    },
    deleteFilter: async function (filterName: string) {
        const res = await axios.delete(appConfig.serverBaseUrl + serverEndpoints.filters + `/${filterName}`);
        return res.data;
    },
};