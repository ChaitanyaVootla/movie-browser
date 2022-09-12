import { getSearchQuery } from '../utils/google';
import moment from 'moment';
import getGoogleData from "../google/search";
import { getTMDBTVDetails } from "../tmdb/tvDetails";
import { Series } from "../db/schemas/Series";

const retainHours = 24;
interface seriesGetOptions {
    force?: Boolean,
    skipGoogle?: Boolean,
}

const getSeriesDetails = async (id: number, options?: seriesGetOptions) => {
    const dbEntry = await Series.findOne({id});
    if (!options?.force && dbEntry && (moment().diff(dbEntry.updatedAt, 'hours') < retainHours)) {
        return dbEntry;
    }
    const tvDetails = await getTMDBTVDetails(id);
    if (!tvDetails?.id) {
        return console.log(`TMDB get for series failed for id: ${id}`)
    }
    let googleData:any = {};
    if (!options?.skipGoogle) {
        googleData = await getGoogleData(getSearchQuery(tvDetails));
        if (!googleData) {
            console.error(`Failed to get google data for movie: ${tvDetails?.name}`)
        }
    }

    if (!tvDetails?.external_ids?.imdb_id || (tvDetails?.external_ids?.imdb_id === googleData?.imdbId)) {
        tvDetails.googleData = googleData;
    } else {
        tvDetails.googleData = {allWatchOptions: []};
    }
    await Series.updateOne(
        {id: id},
        {$set:
            {
                ...tvDetails,
                updatedAt: new Date(),
            },
        },
        {upsert: true});
    return tvDetails;
}

export { getSeriesDetails as getTVDetails };
