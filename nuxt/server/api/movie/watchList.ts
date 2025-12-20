import { JWT } from "next-auth/jwt";
import { IMovie, Movie, MovieLightFileds, MoviesWatchList } from "~/server/models";
import { combineRatings } from "~/server/utils/ratings/combineRatings";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const moviesList = await MoviesWatchList.find({userId: userData?.sub}).select('movieId -_id');
    const movieListIds = moviesList.map((movie) => movie.movieId);
    const movies = await Movie.find({id: {$in: movieListIds}}).select(MovieLightFileds);
    
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
            ratings: combinedRatings
        };
    });
    
    return moviesWithRatings as IMovie[];
});
