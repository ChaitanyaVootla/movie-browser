import { getToken } from '#auth';
import { WatchedMovies } from '~/server/models';

export default defineEventHandler(async (event) => {
    const token = await getToken({ event });
    const watchedMovies = await WatchedMovies.find({userId: token?.sub});
    updateSession(event, {
        password: process.env.SESSION_PASSWORD as string,
    }, {
        watchedMovies,
    });
    return {
        pwsd: process.env.SESSION_PASSWORD as string,
        watchedMovies,
    }
});
