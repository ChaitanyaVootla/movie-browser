import { SERIES_QUERY_PARAMS, Series, SeriesList } from "~/server/models";
import _ from 'lodash';

export default defineEventHandler(async (event) => {
    const allSeriesIds = (await SeriesList.find({}).select('seriesId -_id')).map(doc => doc.toJSON()).map(({seriesId}) => seriesId);
    console.log("Total series: ", allSeriesIds.length);
    const chunks = _.chunk(allSeriesIds, 5);
    console.log("Series total chunks: ", chunks.length);
    for (const chunk of chunks) {
        const getDetailsCalls = chunk.map(id => updateSeriesById(id));
        await Promise.all(getDetailsCalls)
        console.log(`Series chunk ${chunks.indexOf(chunk) + 1} of ${chunks.length} done`)
    }
    return {
        message: `Updated ${allSeriesIds.length} series`,
        seriesIds: allSeriesIds,
    }
});

const updateSeriesById = async (seriesId: number) => {
    const dbSeries = await Series.findOne({ id: seriesId })
    const series: any = await $fetch(`${TMDB.BASE_URL}/tv/${seriesId}?api_key=${process.env.TMDB_API_KEY}${SERIES_QUERY_PARAMS}`, {
        retry: 5,
    }).catch(() => {
        return {};
    });
    if (series?.name) {
        await Series.updateOne(
            { id: seriesId },
            {
                $set: {
                    ...dbSeries?.toJSON(),
                    ...series,
                },
            },
            { upsert: true },
        ).exec();
    }
    return;
}
