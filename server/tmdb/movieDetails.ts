import axios from 'axios';
import { sortBy } from 'lodash';
import { tmdb } from './';

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

const getTMDBMovieDetails = async (id: number) => {
    const [{ data: details }, { data: releaseDates }] = await Promise.all([
        axios.get(`${tmdb.BASE_URL}/movie/${id}?${tmdb.API_KEY}${QUERY_PARAMS}`),
        axios.get(`${tmdb.BASE_URL}/movie/${id}/release_dates?${tmdb.API_KEY}${QUERY_PARAMS}`),
    ]) as [{data: any}, {data: any}];
    details.releaseDates = releaseDates.results;
    if (details.belongs_to_collection) {
        const { data: collectionDetails} : {data: any} = await axios.get(
            `${tmdb.BASE_URL}/collection/${details.belongs_to_collection.id}?${tmdb.API_KEY}`,
        );
        collectionDetails.parts = sortBy(collectionDetails.parts, ({ release_date }) => {
            return release_date ? release_date : 'zzzz';
        });
        details.collectionDetails = collectionDetails;
    }

    return details;
}

export { getTMDBMovieDetails };
