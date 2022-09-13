import { getTVDetails } from "@/series/seriesDetails";
import { chunk } from "lodash"

const updateSeries = async (seriesIds: number[], force = false) => {
    const chunks = chunk(seriesIds, 5);
    console.log("Series total chunks: ", chunks.length);

    let count = 1;
    for (let seriesIds of chunks) {
        const getDetailsCalls = seriesIds.map(id => getTVDetails(id, {force, skipGoogle: false}));
        await Promise.all(getDetailsCalls)
        console.log(`Series chunk ${count++} of ${chunks.length} done ${seriesIds}`)
    }
    return;
}

export { updateSeries };
