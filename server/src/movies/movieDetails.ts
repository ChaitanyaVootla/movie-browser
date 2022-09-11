import { getSearchQuery } from '@/utils/google';
import { getTMDBMovieDetails } from '@/tmdb/movieDetails';
import moment from 'moment';
import getGoogleData from "@/google/search";
import { Movie } from "@/db/schemas/Movies";

const retainHours = 24;
interface movieGetOptions {
    force?: Boolean,
    skipGoogle?: Boolean,
}

const getMovieDetails = async (id: number, options?: movieGetOptions) => {
    const currentTime = new Date();
    const dbEntry = await Movie.findOne({id});
    if (!options?.force && dbEntry && (moment(dbEntry.updatedAt).diff(currentTime, 'hours') < retainHours)) {
        return dbEntry;
    }
    const movieDetails = await getTMDBMovieDetails(id);
    if (!movieDetails?.id) {
        return console.log(`TMDB get for movie failed for id: ${id}`)
    }
    let googleData:any = {};
    if (!options?.skipGoogle) {
        googleData = await getGoogleData(getSearchQuery(movieDetails));
        if (!googleData) {
            console.error(`Failed to get google data for movie: ${movieDetails?.title}`)
        }
    }

    if (!movieDetails.imdb_id || (movieDetails.imdb_id === googleData?.imdbId)) {
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
