import { getToken } from '#auth';
import { WatchedMovies } from '~/server/models';

const getUserData = async (event: any) => {
    const token = await getToken({ event });
    if (!token?.sub) {
        return {};
    }
    const watchedMovies = await WatchedMovies.find({userId: token?.sub}).select({
        movieId: 1,
    });
    const watchedMovieIds = watchedMovies.map((movie) => movie.movieId);
    return {
        watchedMovieIds,
        userId: token.sub,
    };
}

export { getUserData };
