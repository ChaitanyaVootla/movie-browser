import { getSearchQuery } from '@/utils/google';
import { getTMDBMovieDetails } from '../tmdb/movieDetails';
import moment from 'moment';
import getGoogleData from "../google/search";
import { Movie } from "./schemas/Movies";

const retainHours = 24;

const getMovieDetails = async (id: number) => {
    const currentTime = new Date();
    const dbEntry = await Movie.findOne({id});
    if (dbEntry && moment(dbEntry.updatedAt).diff(currentTime, 'hours') < retainHours) {
        return dbEntry;
    }
    const movieDetails = await getTMDBMovieDetails(id);
    let googleData:any = {};
    try {
        googleData = await getGoogleData(getSearchQuery(movieDetails));
    } catch(e) {
        console.error(`Failed to get google data for movie: ${movieDetails.title}`)
    }

    if (!movieDetails.imdb_id || (movieDetails.imdb_id === googleData.imdbId)) {
        movieDetails.googleData = googleData;
    } else {
        movieDetails.googleData = {allWatchOptions: []};
    }
    await Movie.updateOne(
            {id: id},
            {$set:
                {
                    ...movieDetails,
                    updatedAt: new Date(),
                },
            },
            {upsert: true})
    return movieDetails;
}

export { getMovieDetails };
