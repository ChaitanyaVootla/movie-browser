import { Series, SeriesLightFileds } from "~/server/models";

export default defineEventHandler(async (event) => {
    const seriesIds = (getQuery(event).seriesIds as string).split(',').map((id) => parseInt(id)) as number[];
    if (!seriesIds || !seriesIds.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`seriesIds query param is required`);
    }
    const series = await Series.find({id: {$in: seriesIds}}).select(SeriesLightFileds);
    return series;
});
