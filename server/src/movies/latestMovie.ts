import axios from 'axios';
import { tmdb } from '@/tmdb';

const getTMDBLatestMovie = async () => {
    try {
        const latestMovie = await axios.get(`${tmdb.BASE_URL}/movie/latest?${tmdb.API_KEY}`)
        return latestMovie.data;
    } catch (e) {}
}

export { getTMDBLatestMovie };
