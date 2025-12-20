import { JWT } from "next-auth/jwt";
import { Series, SeriesLightFileds, SeriesList } from "~/server/models";
import { combineRatings } from "~/server/utils/ratings/combineRatings";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const seriesList = await SeriesList.find({userId: userData?.sub}).select('seriesId -_id');
    if (!seriesList) {
        return [];
    }
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const series = await Series.find({id: {$in: seriesListIds}}).select(SeriesLightFileds);
    
    // Add combined ratings to each series
    const seriesWithRatings = series.map(serie => {
        const combinedRatings = combineRatings(
            serie.googleData, 
            serie.external_data, 
            serie.vote_average ? Number(serie.vote_average) : undefined, 
            serie.vote_count ? Number(serie.vote_count) : undefined,
            serie.id ? Number(serie.id) : undefined, 
            'tv'
        );
        
        return {
            ...serie.toJSON(),
            ratings: combinedRatings
        };
    });
    
    return seriesWithRatings;
});
