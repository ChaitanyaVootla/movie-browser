import { JWT } from "next-auth/jwt";
import { IMovie, ISeries, Movie, MovieLightFileds, MoviesWatchList } from "~/server/models";
import { Series, SeriesLightFileds, SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT | null;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const [moviesList, seriesList] = await Promise.all([
        MoviesWatchList.find({userId: userData?.sub}).select('movieId -_id'),
        SeriesList.find({userId: userData?.sub}).select('seriesId -_id')
    ]);
    const movieListIds = moviesList.map((movie) => movie.movieId);
    const seriesListIds = seriesList.map((series) => series.seriesId);
    const [movies, series] = await Promise.all([
        Movie.find({id: {$in: movieListIds}}).select(MovieLightFileds),
        Series.find({id: {$in: seriesListIds}}).select(SeriesLightFileds),
    ]);
    return {
        movies,
        series,
    } as {
        movies: IMovie[],
        series: ISeries[],
    };
});
