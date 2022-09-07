import { Db } from "mongodb";
import { dbConstants } from '../utils/constants';
import { getSearchQuery } from '../utils/google';
import moment from 'moment';
import getGoogleData from "../google/search";
import { getTMDBTVDetails } from "../tmdb/tvDetails";

const retainHours = 24;

const getTVDetails = async (db: Db, id: number) => {
    const currentTime = new Date();
    const dbEntry = await db.collection(dbConstants.tvCollection).findOne({id});
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
    await db.collection(dbConstants.tvCollection).updateOne(
        {id: id},
        {$set:
            {
                ...tvDetails,
                updateAt: new Date(),
            },
        },
        {upsert: true});
    return tvDetails;
}

export { getTVDetails };
