import { getUserData } from "~/server";
import { Movie } from "~/server/models";

export default defineEventHandler(async (event) => {
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
    const userData = await getUserData(event);
    if (userData) {
        movie = {
            ...movie,
            watched: userData.watchedMovieIds.includes(parseInt(movieId as string)),
        }
    }
    return movie;
});
