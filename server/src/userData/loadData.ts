import { getUserContinueWatching } from "@/continueWatching/userData";
import { dbConstants } from "@/db/constants";
import { Filters, IFilter } from "@/db/schemas/filters";
import { Movie, MovieLightFileds } from "@/db/schemas/Movies";
import { IMoviesWatchList, MoviesWatchList } from "@/db/schemas/MovieWatchList";
import { IRecent, Recent } from "@/db/schemas/recents";
import { Series, SeriesLightFileds } from "@/db/schemas/Series";
import { ISeriesList, SeriesList } from "@/db/schemas/seriesList";
import { IWatchedMovie, WatchedMovies } from "@/db/schemas/WatchedMovies";
import { TokenPayload } from "google-auth-library";
import { keyBy } from "lodash";
import { Db } from "mongodb";

const loadData = async (user: TokenPayload, db: Db) => {
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
    
    const watchedMovieIds = watchedMovies.map(({movieId}) => movieId);
    const watchListMovieIds = watchListMovies.map(({movieId}) => movieId);
    const watchListMovieToCreatedAt = keyBy(watchListMovies, 'movieId');
    const seriesListIds = seriesList.map(({seriesId}) => seriesId);

    const watchListMoviesData = await (await Movie.find({id: {$in: watchListMovieIds}})
        .select(MovieLightFileds)).map(doc => doc.toJSON()).map((movie: any) => ({
            ...movie,
            createdAt: watchListMovieToCreatedAt[movie.id]?.createdAt
        }));
    const recentMovies = await Recent.aggregate([
        {
            $match: {userId: user.sub, isMovie: true}
        },
        {
            $project: {
                id: '$itemId',
                updatedAt: '$updatedAt',
            }
        },
        {
            $lookup: {
                from: dbConstants.collections.movies,
                as: 'movie',
                localField: 'id',
                foreignField: 'id',
                pipeline: [
                    {
                        $project: {
                            id: '$id',
                            title: '$title',
                            backdrop_path: '$backdrop_path',
                            vote_average: '$vote_average',
                            overview: '$overview',
                            genres: '$genres',
                            googleData: '$googleData',
                            _id: 0,
                        }
                    }
                ]
            }
        },
        {
            $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$movie", 0 ] }, "$$ROOT" ] } }
        },
        {
            $project: {
                movie: 0,
            }
        },
        {
            $addFields: {
                isMovie: true,
            }
        },
    ]);
    const recentSeries = await Recent.aggregate([
        {
            $match: {userId: user.sub, isMovie: false}
        },
        {
            $project: {
                id: '$itemId',
                updatedAt: '$updatedAt',
            }
        },
        {
            $lookup: {
                from: dbConstants.collections.series,
                as: 'series',
                localField: 'id',
                foreignField: 'id',
                pipeline: [
                    {
                        $project: {
                            id: '$id',
                            name: '$name',
                            backdrop_path: '$backdrop_path',
                            vote_average: '$vote_average',
                            first_air_date: '$first_air_date',
                            overview: '$overview',
                            genres: '$genres',
                            googleData: '$googleData',
                            _id: 0,
                        }
                    }
                ]
            }
        },
        {
            $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$series", 0 ] }, "$$ROOT" ] } }
        },
        {
            $project: {
                series: 0,
            }
        },
        {
            $addFields: {
                isMovie: false,
            }
        },
    ]);
    const seriesData = await (await Series.find({id: {$in: seriesListIds}})
        .select(SeriesLightFileds)).map(doc => doc.toJSON());

    const continueWatching = await getUserContinueWatching(user);
    return {
        user,
        continueWatching,
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
