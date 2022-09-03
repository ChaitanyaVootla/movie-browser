import axios from 'axios';
import { sortBy } from 'lodash';
import { tmdb } from './';

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

const getTMDBTVDetails = async (id: number) => {
    const {data: details}: {data: any} = await axios.get(`${tmdb.BASE_URL}/tv/${id}?${tmdb.API_KEY}${QUERY_PARAMS}`);
    return details;
}

export { getTMDBTVDetails };
