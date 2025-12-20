import { Series, SeriesLightFileds } from "~/server/models";
import { combineRatings } from "~/server/utils/ratings/combineRatings";

export default defineEventHandler(async (event) => {
    const seriesIds = (getQuery(event).seriesIds as string).split(',').map((id) => parseInt(id)) as number[];
    if (!seriesIds || !seriesIds.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`seriesIds query param is required`);
    }
    const series = await Series.find({id: {$in: seriesIds}}).select(SeriesLightFileds);
    
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
