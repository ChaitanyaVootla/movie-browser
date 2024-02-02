import { JWT } from "next-auth/jwt";
import { ISeries, Series, SeriesLightFileds, SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const [seriesList] = await Promise.all([
        SeriesList.find({userId: userData?.sub}).select('seriesId -_id')
    ]);
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const [series] = await Promise.all([
        Series.find({id: {$in: seriesListIds}}).select(SeriesLightFileds),
    ]);
    return series as ISeries[];
});
