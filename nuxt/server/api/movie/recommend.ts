import { JWT } from "next-auth/jwt";
import { WatchedMovies } from "~/server/models";

export default defineEventHandler(async (event) => {
    let body = await readBody(event);

    const userData = event.context.userData as JWT;
    if (userData?.sub) {
        const watched = await WatchedMovies.find({userId: userData?.sub}).select('movieId').sort({updatedAt: -1});
        if (watched.length) {
            body = {
                ...body,
                watchedIds: watched.map(({ movieId }) => movieId),
            }
        }
    }
    const movies: any = await $fetch('http://127.0.0.1:5000/recommend', {
        method: 'POST',
        body,
    }).catch((error: Error) => {
        return [];
    });
    return movies;
});
