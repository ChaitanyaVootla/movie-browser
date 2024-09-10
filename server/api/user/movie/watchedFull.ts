import { JWT } from "next-auth/jwt";
import { WatchedMovies } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const watchedMovies = await WatchedMovies.find({userId: userData?.sub}).select('movieId createdAt -_id').sort({createdAt: -1});
    const watchedMovieIds = watchedMovies.map((movie) => movie.movieId);
    const movies = await $fetch('/api/movie/getMultiple',
        {
            method: 'POST',
            body: {
                movieIds: watchedMovieIds
            }
        }
    );
    return movies;
});
