import { Filters, IFilter } from "@/db/schemas/filters";
import { Movie, MovieLightFileds } from "@/db/schemas/Movies";
import { IMoviesWatchList, MoviesWatchList } from "@/db/schemas/MovieWatchList";
import { IRecent, Recent } from "@/db/schemas/recents";
import { Series, SeriesLightFileds } from "@/db/schemas/Series";
import { ISeriesList, SeriesList } from "@/db/schemas/seriesList";
import { IWatchedMovie, WatchedMovies } from "@/db/schemas/WatchedMovies";
import { updateMovies } from "@/movies/updateMovies";
import { updateSeries } from "@/series/updateSeries";
import { TokenPayload } from "google-auth-library";
import { keyBy } from "lodash";

const loadData = async (user: TokenPayload) => {
    const watchedMovies = (
        await WatchedMovies.find({userId: user.sub}).select('movieId -_id')
        ).map(doc=> doc.toJSON()) as IWatchedMovie[];
    const watchListMovies = (
        await MoviesWatchList.find({userId: user.sub}).select('movieId createdAt -_id')
        ).map(doc=> doc.toJSON()) as IMoviesWatchList[];
    const seriesList = (
        await SeriesList.find({userId: user.sub}).select('seriesId -_id')
        ).map(doc=> doc.toJSON()) as ISeriesList[];
    const filters = (
        await Filters.find({userId: user.sub})).map(doc=> doc.toJSON()) as IFilter[];
    const recentsDocs = (
        await Recent.find({userId: user.sub}).select('itemId isMovie -_id')).map(doc=> doc.toJSON()) as IRecent[];

    const recentMovieIds = recentsDocs.filter(({isMovie}) => isMovie).map(({itemId}) => itemId);
    const recentSeriesIds = recentsDocs.filter(({isMovie}) => !isMovie).map(({itemId}) => itemId);
    
    const watchedMovieIds = watchedMovies.map(({movieId}) => movieId);
    const watchListMovieIds = watchListMovies.map(({movieId}) => movieId);
    const watchListMovieToCreatedAt = keyBy(watchListMovies, 'movieId');
    const seriesListIds = seriesList.map(({seriesId}) => seriesId);

    const watchListMoviesData = await (await Movie.find({id: {$in: watchListMovieIds}})
        .select(MovieLightFileds)).map(doc => doc.toJSON()).map((movie: any) => ({
            ...movie,
            createdAt: watchListMovieToCreatedAt[movie.id]?.createdAt
        }));
    const recentMovies = await (await Movie.find({id: {$in: recentMovieIds}})
        .select(MovieLightFileds)).map(doc => doc.toJSON());
    const recentSeries = await (await Series.find({id: {$in: recentSeriesIds}})
        .select(SeriesLightFileds)).map(doc => doc.toJSON());
    const seriesData = await (await Series.find({id: {$in: seriesListIds}})
        .select(SeriesLightFileds)).map(doc => doc.toJSON());

    // updateMovies(watchListMovieIds);
    // updateSeries(seriesListIds);
    return {
        user,
        recents: recentMovies.concat(recentSeries),
        watchedMovieIds,
        watchListMovieIds,
        watchListMovies: watchListMoviesData,
        seriesListIds,
        filters,
        seriesList: seriesData,
    };
}

export { loadData };
