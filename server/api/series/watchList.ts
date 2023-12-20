import { JWT } from "next-auth/jwt";
import { Series, SeriesLightFileds, SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const seriesList = await SeriesList.find({userId: userData.sub}).select('seriesId -_id');
    if (!seriesList) {
        return [];
    }
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const series = await Series.find({id: {$in: seriesListIds}}).select(SeriesLightFileds);
    return series;
});
