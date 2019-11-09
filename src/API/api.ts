import { appConfig, endpoints, discoverDefaultQueries, searchDefaultQueries } from './Constants';
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
    getTrendingPeople: async function() {
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.trendingPeopleList + '?api_key=' + appConfig.token);
        return res.data;
    },
    getMovieDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.movieDetails + id + '?&append_to_response=videos,images,credits&api_key=' + appConfig.token);
        return new MovieDetails(details);
    },
    getTvDetails: async function(id: number) {
        const { data: details} = await axios.get(appConfig.apiBaseUrl + endpoints.tvDetails + id + '?&append_to_response=videos,images,credits&api_key=' + appConfig.token);
        return new TvDetails(details);
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
    searchMovies: async function(searchString: string) {
        const searchQuery = `&query=${searchString}` + searchDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.searchMovies + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
    getDiscoverMovies: async function(searchQuery: string) {
        searchQuery += discoverDefaultQueries;
        const res = await axios.get(appConfig.apiBaseUrl + endpoints.discoverMovies + '?api_key=' + appConfig.token + searchQuery);
        return res.data;
    },
};
