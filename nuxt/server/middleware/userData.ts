import { getToken } from '#auth';
import { WatchedMovies } from '~/server/models';
import { cache } from '../index';

export default defineEventHandler(async (event) => {
    // const token = await getToken({ event });
    // if (!token?.sub) {
    //     event.context.data = {
    //         fuck: 'you'
    //     };
    //     return;
    // }
    // if (!cache.has(token?.sub)) {
    //     const watchedMovies = await WatchedMovies.find({userId: token?.sub}).select({
    //         movieId: 1,
    //     });
    //     const watchedMovieIds = watchedMovies.map((movie) => movie.movieId);
    //     cache.set(token?.sub, watchedMovieIds);
    // }
    // event.context.data = {
    //     watchedMovieIds: cache.get(token.sub)
    // };
    // console.log("*************** middleware", event.context);
})
