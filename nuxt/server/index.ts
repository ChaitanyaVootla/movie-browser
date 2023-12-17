import NC from 'node-cache';
import { getToken } from '#auth';
import { WatchedMovies } from '~/server/models';

const cache = new NC();

const getUserData = async (event: any) => {
    const token = await getToken({ event });
    if (!token?.sub) {
        return;
    }
    if (!cache.has(token?.sub)) {
        console.log("fetching and injecting")
        const watchedMovies = await WatchedMovies.find({userId: token?.sub}).select({
            movieId: 1,
        });
        const watchedMovieIds = watchedMovies.map((movie) => movie.movieId);
        cache.set(token?.sub, { watchedMovieIds });
    }
    return cache.get(token.sub) as {
        watchedMovieIds: number[];
    };
}

export { cache, getUserData };
