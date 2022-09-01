import { Db } from "mongodb";
import { dbConstants } from '../utils/constants';
import { getTMDBMovieDetails } from '../tmdb/movieDetails';

const getMovieDetails = async (db: Db, id: number) => {
    const dbEntry = await db.collection(dbConstants.movieCollection).findOne({id});
    if (dbEntry) {
        return dbEntry;
    }
    const movieDetails = await getTMDBMovieDetails(id);
    await db.collection(dbConstants.movieCollection).insertOne(movieDetails);
    return movieDetails;
}

export { getMovieDetails };
