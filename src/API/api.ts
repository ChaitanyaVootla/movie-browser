import {
    appConfig,
    endpoints,
    discoverDefaultQueries,
    searchDefaultQueries,
    latestMovieQuery,
    personDetailsDefaultQuery,
    detailsDefaultQuery,
} from './Constants';
import axios from 'axios';
import { MovieDetails } from '@/Models/movieDetails';
import { TvDetails } from '@/Models/tvDetails';

export const api = {
    getTrendingTv: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingTvList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingMovies: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingMoviesList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingMoviesWeek: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingMoviesListWeek + '?api_key=' + appConfig.token);
        return res.data;
    },
    getTrendingPeople: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingPeopleList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getLatestMovies: async function(query: string) {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + latestMovieQuery + query);
        return res.data;
    },
    getMovieDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.movieDetails + id +
            '?&api_key=' + appConfig.token + detailsDefaultQuery);
        return new MovieDetails(details);
    },
    getTvDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + id +
            '?&api_key=' + appConfig.token + detailsDefaultQuery);
        return new TvDetails(details);
    },
    getSeasonDetails: async function(seriesId: number, seasonNumber: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + seriesId + `/season/${seasonNumber}` +
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
    getDiscoverMovies: async function(searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getDiscoverSeries: async function(searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverSeries + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
};
