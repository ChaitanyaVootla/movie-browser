import { JWT } from "next-auth/jwt";
import { IMovie, Movie, WatchedMovies } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const movieId = getRouterParam(event, 'movieId');
    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }

    let movie = {} as any;
    const dbMovie = Movie.findOne({ id: movieId });
    if (dbMovie) {
        movie = dbMovie;
    }
    if (!movie.title) {
        movie = await $fetch(`https://themoviebrowser.com/node/movieDetails/${movieId}`).catch((error: Error) => {
            return {};
        });
    }
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    if (userData?.sub) {
        const watchedDbRes = await WatchedMovies.findOne({ movieId: parseInt(movieId as string), userId: parseInt(userData.sub as string) }).select('movieId -_id');
        movie = {
            ...movie,
            watched: !!watchedDbRes,
        }
    }
    return movie as IMovie;
});
