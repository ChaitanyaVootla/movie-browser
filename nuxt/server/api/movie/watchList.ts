import { JWT } from "next-auth/jwt";
import { IMovie, Movie, MovieLightFileds, MoviesWatchList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const moviesList = await MoviesWatchList.find({userId: parseInt(userData.sub as string)}).select('movieId -_id');
    const movieListIds = moviesList.map((movie) => movie.movieId);
    return (await Movie.find({id: {$in: movieListIds}}).select(MovieLightFileds)) as IMovie[];
});
