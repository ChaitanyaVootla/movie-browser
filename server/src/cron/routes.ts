import { Movie } from "@/db/schemas/Movies";
import { MoviesWatchList } from "@/db/schemas/MovieWatchList";
import { Series } from "@/db/schemas/Series";
import { SeriesList } from "@/db/schemas/seriesList";
import { WatchedMovies } from "@/db/schemas/WatchedMovies";
import { updateMovies } from "@/movies/updateMovies";
import { updateSeries } from "@/series/updateSeries";
import { Application } from "express";
import { cronMovies } from "./movies";
import { cronSeries } from "./series";

const setupRoute = (app: Application) => {
    app.get('/cron/status',
        async (req, res) => {
            try {
                const allWatchedMovieIds = (await WatchedMovies.find({}).select('movieId -_id')).map(doc => doc.toJSON()).map(({movieId}) => movieId);
                const allWatchListMoviesIds = (await MoviesWatchList.find({}).select('movieId -_id')).map(doc => doc.toJSON()).map(({movieId}) => movieId);
                const allSeriesIds = (await SeriesList.find({}).select('seriesId -_id')).map(doc => doc.toJSON()).map(({seriesId}) => seriesId);

                const allMoviesSet = new Set(allWatchedMovieIds.concat(allWatchListMoviesIds));
                const dbMoviesSize = await Movie.count({})
                const dbSeriesSize = await Series.count({})

                const withImdbId = await Movie.count({imdb_id: {$ne: null}})
                const withoutGoogleDetails = await Movie.count({
                    imdb_id: {
                        $ne: null
                    },
                    "googleData.imdbId": {
                        $ne: null
                    },
                });
                res.json({
                    movies: {
                        userMovies: allMoviesSet.size,
                        fetched: dbMoviesSize,
                        withImdbId,
                        withoutGoogleDetails,
                    },
                    series: {
                        userSeries: allSeriesIds.length,
                        fetched: dbSeriesSize,
                    },
                })
            } catch (e) {
            }
        }
    );
    app.get('/cron/loadAll',
        async (req, res) => {
            const allWatchedMovieIds = (await WatchedMovies.find({}).select('movieId -_id')).map(doc => doc.toJSON()).map(({movieId}) => movieId);
            const allWatchListMoviesIds = (await MoviesWatchList.find({}).select('movieId -_id')).map(doc => doc.toJSON()).map(({movieId}) => movieId);
            const allSeriesIds = (await SeriesList.find({}).select('seriesId -_id')).map(doc => doc.toJSON()).map(({seriesId}) => seriesId);

            res.json({
                movieCount: allWatchedMovieIds.length,
                seriesCount: allSeriesIds.length,
            })
            
            await updateMovies(allWatchedMovieIds.concat(allWatchListMoviesIds));
            await updateSeries(allSeriesIds)
        }
    );
    app.get('/cron/popular/movies',
        async (req, res) => {
            const count = await cronMovies();
            res.json({count});
        }
    );
    app.get('/cron/popular/series',
        async (req, res) => {
            const count = await cronSeries();
            res.json({count});
        }
    );
}

export {setupRoute as default};
