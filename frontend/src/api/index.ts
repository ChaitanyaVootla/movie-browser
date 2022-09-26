import axios from 'axios'

const api =  axios.create()
const serverUrl = import.meta.env.SERVER_URL || 'http://localhost:3000'
console.log(serverUrl)
const endpoints = {
    tmdbUrl: `${serverUrl}/tmdb`,
    serverUrl,
}

export default {
    async getTrendingAll() {
        const {data: trending} = await api.get(`${endpoints.tmdbUrl}/trending/all/day`)
        return trending.results || [];
    },
    async getSeriesDetails(id: number) {
        const {data: details} = await api.get(`${endpoints.serverUrl}/seriesDetails/${id}`)
        return details;
    },
    async getMovieDetails(id: number) {
        const {data: details} = await api.get(`${endpoints.serverUrl}/movieDetails/${id}`)
        return details;
    },
    getDiscoverMovies: async function (searchQuery: string) {
        const {data: items} = await axios.get(`${endpoints.tmdbUrl}/discover/movie?${searchQuery}`);
        return items.results;
    },
}
