import { getSearchQuery } from '../utils/google';
import moment from 'moment';
import getGoogleData from "../google/search";
import { getTMDBTVDetails } from "../tmdb/tvDetails";
import { Series } from "./schemas/Series";

const retainHours = 24;

const getTVDetails = async (id: number) => {
    const currentTime = new Date();
    const dbEntry = await Series.findOne({id});
    if (dbEntry && moment(dbEntry.updatedAt).diff(currentTime, 'hours') < retainHours) {
        return dbEntry;
    }
    const tvDetails = await getTMDBTVDetails(id);
    let googleData:any = {};
    try {
        googleData = await getGoogleData(getSearchQuery(tvDetails));
    } catch(e) {
        console.error(`Failed to get google data for tv: ${tvDetails.name}`)
    }

    if (!tvDetails?.external_ids?.imdb_id || (tvDetails?.external_ids?.imdb_id === googleData.imdbId)) {
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

export { getTVDetails };
