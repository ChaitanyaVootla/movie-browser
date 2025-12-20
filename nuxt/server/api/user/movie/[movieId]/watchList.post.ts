import { JWT } from "next-auth/jwt";
import { MoviesWatchList } from "~/server/models";

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
    const objectToAdd = {
        movieId: parseInt(movieId as string),
        userId: parseInt(userData.sub as string),
        createdAt: new Date(),
    };
    const newEntry = new MoviesWatchList(objectToAdd);
    await newEntry.save().catch(()=>{});
    return {
        movieId,
        userId: userData.sub,
    };
});
