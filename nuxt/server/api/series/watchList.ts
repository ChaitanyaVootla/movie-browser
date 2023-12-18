import { getUserData } from "~/server";
import { Series, SeriesLightFileds, SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = await getUserData(event);
    if (!userData || !userData?.userId) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const seriesList = await SeriesList.find({userId: parseInt(userData.userId as string)}).select('seriesId -_id');
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const series = await Series.find({id: {$in: seriesListIds}}).select(SeriesLightFileds);
    return series;
});
