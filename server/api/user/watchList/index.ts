import _ from "lodash";
import { JWT } from "next-auth/jwt";
import { IMovie, ISeries, Movie, MoviesWatchList } from "~/server/models";
import { Series, SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const [moviesList, seriesList] = await Promise.all([
        MoviesWatchList.find({userId: userData?.sub}).select('movieId createdAt -_id').sort({createdAt: -1}),
        SeriesList.find({userId: userData?.sub}).select('seriesId createdAt -_id')
    ]);
    const movieListIds = moviesList.map((movie) => movie.movieId);
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const [movies, series] = await Promise.all([
        Movie.find({id: {$in: movieListIds}}).select('-_id id title poster_path backdrop_path genres vote_average googleData overview images.backdrops'),
        Series.find({id: {$in: seriesListIds}}).select('-_id id name poster_path next_episode_to_air last_episode_to_air status number_of_seasons images.backdrops'),
    ]);
    const moviesById = _.keyBy(movies, 'id');
    return {
        movies: moviesList.map((listMovie) => ({
            ...listMovie.toObject(),
            ...moviesById[listMovie.movieId].toObject(),
        })),
        series,
    } as {
        movies: IMovie[],
        series: ISeries[],
    };
});
