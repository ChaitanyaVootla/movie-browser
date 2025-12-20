import { JWT } from "next-auth/jwt";
import { MoviesWatchList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const watchListMovies = await MoviesWatchList.find({userId: userData?.sub}).select('movieId createdAt -_id').sort({createdAt: -1});
    return watchListMovies.map((movie) => movie.movieId);
});
