import { getSearchQuery } from '@/utils/google';
import { getTMDBMovieDetails } from '@/tmdb/movieDetails';
import moment from 'moment';
import getGoogleData from "@/google/search";
import { Movie } from "@/db/schemas/Movies";
import { getGoogleDataLite } from '@/google/searchLite';
import { getRottenTomatoesLite } from '@/rottenTomatoes/searchLite';

const retainHours = 24;
interface movieGetOptions {
    force?: Boolean,
    skipGoogle?: Boolean,
}

const getMovieDetails = async (id: number, options?: movieGetOptions) => {
    const dbEntry = await Movie.findOne({id});
    if (
        !options?.force
        && dbEntry
        // && (moment().diff(dbEntry.updatedAt, 'hours') < retainHours)
        ) {
        return dbEntry;
    }
    const movieDetails = await getTMDBMovieDetails(id);
    if (!movieDetails?.id) {
        return console.log(`TMDB get for movie failed for id: ${id}`)
    }
    let googleData:any = {allWatchOptions: []};
    movieDetails.googleData = googleData;
    if (!options?.skipGoogle) {
        let response = await getGoogleData(getSearchQuery(movieDetails));
        if (!response) {
            console.error(`Failed to get proper google data for movie: ${movieDetails?.title}`);
            response = await getGoogleDataLite(getSearchQuery(movieDetails));
            if (!response) {
                console.error(`Failed to get lite google data for movie: ${movieDetails?.title}`);
            } else if (!movieDetails.imdb_id || (movieDetails.imdb_id === response?.imdbId)) {
                movieDetails.googleData = response;
            }
        } else {
            movieDetails.googleData = response;
        }
    }

    const existingMovieObj: any = await Movie.findOne({id});
    if (existingMovieObj?.googleData?.ratings?.length) {
        movieDetails.googleData = existingMovieObj.googleData;
    }
    const rtLink = movieDetails.googleData.ratings?.find(({name}) => name === 'Rotten Tomatoes')?.link;
    if (rtLink) {
        let rtRes = await getRottenTomatoesLite(rtLink);
        movieDetails.rottenTomatoes = rtRes;
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

export { getMovieDetails, movieGetOptions };
