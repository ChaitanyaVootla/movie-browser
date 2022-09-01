import axios from 'axios';
import { tmdb } from '../tmdb/index';

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

const getTMDBMovieDetails = async (id: number) => {
    const [{ data: details }, { data: release_dates }] = await Promise.all([
        axios.get(`${tmdb.BASE_URL}/movie/${id}?${tmdb.API_KEY}${QUERY_PARAMS}`),
        axios.get(`${tmdb.BASE_URL}/movie/${id}/release_dates?${tmdb.API_KEY}${QUERY_PARAMS}`),
    ]) as [{data: any}, {data: any}];
    details.release_dates = release_dates.results;
    if (details.belongs_to_collection) {
        const { data: collection_details } = await axios.get(
            `${tmdb.BASE_URL}/collection/${details.belongs_to_collection.id}?${tmdb.API_KEY}`,
        );
        details.collection_details = collection_details;
    }

    return details;
}

export { getTMDBMovieDetails };
