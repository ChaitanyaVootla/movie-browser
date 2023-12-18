import { getUserData } from "~/server";
import { WatchedMovies } from "~/server/models";

export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    const userData = await getUserData(event);
    if (!userData || !userData?.userId) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const objectToDelete =
        {
            movieId: parseInt(movieId as string),
            userId: parseInt(userData.userId as string),
        };
    await WatchedMovies.deleteOne(objectToDelete)
    return {
        movieId,
        userId: userData.userId,
    };
});
