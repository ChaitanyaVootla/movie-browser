import { Series } from "@/db/schemas/Series";
import { getTVDetails } from "@/series/seriesDetails";
import { chunk } from "lodash"

const updateSeries = async (seriesIds: number[], force = false, skipGoogle = true) => {
    const chunks = chunk(seriesIds, 5);
    console.log("Series total chunks: ", chunks.length);

    let count = 1;
    for (let seriesIds of chunks) {
        const getDetailsCalls = seriesIds.map(id => getTVDetails(id, {force, skipGoogle}));
        await Promise.all(getDetailsCalls)
        console.log(`Series chunk ${count++} of ${chunks.length} done ${seriesIds}`)
    }

    // add rank
    const topSeries = (await Series.find({popularity: {$gte: 100}}).sort({popularity: -1})
        .select('id')).map(doc => doc.toJSON());
    let rank = 1;
    for (let series of topSeries) {
        await Series.updateOne(
            {id: series.id},
            {$set:
                {
                    rank: rank++,
                },
            },
        );
    }
    return;
}

export { updateSeries };
