import { JWT } from "next-auth/jwt";
import { WatchedMovies } from "~/server/models";
import { IWatchedMovie } from "~/server/models/watchedMovies";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const movieId = getRouterParam(event, 'movieId');
    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const objectToAdd: IWatchedMovie =
    {
        movieId: parseInt(movieId as string),
        userId: parseInt(userData.sub as string),
        createdAt: new Date(),
    };
    const newEntry = new WatchedMovies(objectToAdd);
    await newEntry.save().catch(()=>{});
    return {
        movieId,
        userId: userData.sub,
    };
});
