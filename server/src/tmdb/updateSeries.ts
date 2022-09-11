import { getTVDetails } from "@/series/seriesDetails";
import { chunk } from "lodash"

const updateSeries = async (seriesIds: number[]) => {
    const chunks = chunk(seriesIds, 5);
    for (let seriesIds of chunks) {
        const getDetailsCalls = seriesIds.map(id => getTVDetails(id));
        await Promise.all(getDetailsCalls)
    }
    return;
}

export { updateSeries };
