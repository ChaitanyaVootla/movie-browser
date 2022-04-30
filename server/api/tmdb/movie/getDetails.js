const axios = require('axios').default;
const HOURS_TO_UPDATE = 4;
const db = require('../../db');
const tmdb = require('../');

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords';
async function getDetails(id) {
    const dbResult = await db.MovieDetails.findOne({ where: { id: id } });
    if (dbResult) {
        // await dbResult.destroy();
        const createdTime = new Date(dbResult.createdAt);
        const hoursSinceUpdate = (Date.now() - createdTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate > HOURS_TO_UPDATE) {
            await dbResult.destroy();
        } else {
            return dbResult.data;
        }
    }
    const [{ data: details }, { data: release_dates }] = await Promise.all([
        axios.get(`${tmdb.BASE_URL}movie/${id}?${tmdb.API_KEY}${QUERY_PARAMS}`),
        axios.get(`${tmdb.BASE_URL}movie/${id}/release_dates?${tmdb.API_KEY}${QUERY_PARAMS}`),
    ]);
    details.release_dates = release_dates.results;
    if (details.belongs_to_collection) {
        const { data: collection_details } = await axios.get(
            `${tmdb.BASE_URL}collection/${details.belongs_to_collection.id}?${tmdb.API_KEY}`,
        );
        details.collection_details = collection_details;
    }
    console.log('==== MOVIE DETAILS FETCHED FOR ====', details.title);

    await db.MovieDetails.create({
        id: id,
        data: details,
    });
    return details;
}

module.exports = getDetails;
