import { Db } from "mongodb";
import { dbConstants } from '../utils/constants';
import { getSearchQuery } from '../utils/google';
import { getTMDBMovieDetails } from '../tmdb/movieDetails';
import moment from 'moment';
import getGoogleData from "../google/search";

const retainHours = 24;

const getMovieDetails = async (db: Db, id: number) => {
    const currentTime = new Date();
    const dbEntry = await db.collection(dbConstants.movieCollection).findOne({id});
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
    await db.collection(dbConstants.movieCollection).updateOne(
        {id: id},
        {$set:
            {
                ...movieDetails,
                updateAt: new Date(),
            },
        },
        {upsert: true});
    return movieDetails;
}

export { getMovieDetails };
