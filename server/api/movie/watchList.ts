import { JWT } from "next-auth/jwt";
import { IMovie, Movie, MovieLightFileds, MoviesWatchList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const moviesList = await MoviesWatchList.find({userId: userData?.sub}).select('movieId -_id');
    const movieListIds = moviesList.map((movie) => movie.movieId);
    return (await Movie.find({id: {$in: movieListIds}}).select(MovieLightFileds)) as IMovie[];
});
