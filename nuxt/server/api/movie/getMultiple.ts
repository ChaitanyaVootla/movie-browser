import { Movie, MovieLightFileds } from "~/server/models";
import { combineRatings } from "~/server/utils/ratings/combineRatings";

export default defineEventHandler(async (event) => {
    const movieIds = (getQuery(event).movieIds as string).split(',').map((id) => parseInt(id)) as number[];
    if (!movieIds || !movieIds.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`movieIds query param is required`);
    }
    const movies = await Movie.find({id: {$in: movieIds}}).select(MovieLightFileds);
    
    console.log("mapping ratings to movies");
    // Add combined ratings to each movie
    const moviesWithRatings = movies.map(movie => {
        const combinedRatings = combineRatings(
            movie.googleData, 
            movie.external_data, 
            movie.vote_average ? Number(movie.vote_average) : undefined, 
            movie.vote_count ? Number(movie.vote_count) : undefined,
            movie.id ? Number(movie.id) : undefined, 
            'movie'
        );
        
        return {
            ...movie.toJSON(),
            ratings: combinedRatings || {error: 'No ratings found'},
        };
    });
    
    return moviesWithRatings;
});
