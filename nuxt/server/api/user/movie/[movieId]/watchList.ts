import { JWT } from "next-auth/jwt";
import { MoviesWatchList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const movieId = getRouterParam(event, 'movieId');
    if (userData?.sub) {
        const watchedDbRes = await MoviesWatchList.findOne({ movieId: parseInt(movieId as string), userId: parseInt(userData.sub as string) }).select('movieId -_id');
        return !!watchedDbRes;
    }
    return false;
});
