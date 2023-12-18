import { getUserData } from "~/server";
import { Movie, MovieLightFileds, MoviesWatchList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = await getUserData(event);
    if (!userData || !userData?.userId) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const moviesList = await MoviesWatchList.find({userId: parseInt(userData.userId as string)}).select('movieId -_id');
    const movieListIds = moviesList.map((movie) => movie.movieId);
    return await Movie.find({id: {$in: movieListIds}}).select(MovieLightFileds);
});
