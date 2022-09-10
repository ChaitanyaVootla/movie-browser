import { Db } from "mongodb";
import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { Response } from "express";
import { getMovieDetails } from "@/db/movieDetails";
import { IWatchedMovie, WatchedMovies } from "@/db/schemas/WatchedMovies";
import { IMoviesWatchList, MoviesWatchList } from "@/db/schemas/MovieWatchList";
import { ISeriesList, SeriesList } from "@/db/schemas/seriesList";

const setupRoute = (app, db: Db) => {
    app.get('/user',
        async (req:IGetUserAuthInfoRequest, res) => {
            if (req.user) {
                res.json(req.user)
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED);
            }
        }
    );
    app.get('/loadData',
        async(req:IGetUserAuthInfoRequest, res:Response) => {
            if (req.user?.sub) {
                const watchedMovies = (
                    await WatchedMovies.find({userId: req.user.sub}).select('movieId -_id')
                    ).map(doc=> doc.toJSON()) as IWatchedMovie[];
                const watchListMovies = (
                    await MoviesWatchList.find({userId: req.user.sub}).select('movieId -_id')
                    ).map(doc=> doc.toJSON()) as IMoviesWatchList[];
                const seriesList = (
                    await SeriesList.find({userId: req.user.sub}).select('seriesId -_id')
                    ).map(doc=> doc.toJSON()) as ISeriesList[];
                const watchedMovieIds = watchedMovies.map(({movieId}) => movieId);
                const watchListMovieIds = watchListMovies.map(({movieId}) => movieId);
                const seriesListIds = seriesList.map(({seriesId}) => seriesId);
                res.json({
                    user: req.user,
                    watchedMovieIds,
                    watchListMovieIds,
                    seriesListIds,
                });
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.post('/watchedMovies/:id',
        async (req:IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const movieId = parseInt(req.params.id);
                const objectToAdd: IWatchedMovie = 
                {
                    movieId,
                    userId: parseInt(req.user.sub),
                    createdAt: new Date(),
                };
                const newEntry = new WatchedMovies(objectToAdd);
                await newEntry.save().catch(()=>{});
                getMovieDetails(movieId);
                res.status(200).send();
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.post('/watchedMoviesBulk',
        async (req:IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const rawMovies = req.body.data as any[];
                const MoviesToPush = rawMovies.map(({id, updatedAt}) =>
                    ({movieId: id, createdAt: updatedAt, userId: parseInt(req.user.sub)}));
                try {
                    await WatchedMovies.insertMany(MoviesToPush, {ordered: false});
                } catch(e) {} finally {
                    res.send('ok');
                }
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.post('/moviesWatchListBulk',
        async (req:IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const rawMovies = req.body.data as any[];
                const MoviesToPush = rawMovies.map(({id, updatedAt}) =>
                    ({movieId: id, createdAt: updatedAt, userId: parseInt(req.user.sub)}));
                try {
                    await MoviesWatchList.insertMany(MoviesToPush, {ordered: false});
                } catch(e) {} finally {
                    res.send('ok');
                }
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.post('/seriesListBulk',
        async (req:IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const rawMovies = req.body.data as any[];
                const seriesToPush = rawMovies.map(({id, updatedAt}) =>
                    ({seriesId: id, createdAt: updatedAt, userId: parseInt(req.user.sub)}));
                try {
                    await SeriesList.insertMany(seriesToPush, {ordered: false});
                } catch(e) {} finally {
                    res.send('ok');
                }
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.delete('/watchedMovies/:id',
        async (req:IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const objectToDelete = 
                    {
                        movieId: parseInt(req.params.id),
                        userId: parseInt(req.user.sub),
                    };
                await WatchedMovies.deleteOne(objectToDelete)
                res.status(200).send();
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.get('/watchedMovies',
        async (req:IGetUserAuthInfoRequest, res) => {
            if (req.user?.sub) {
                const objs = (await WatchedMovies.find({userId: req.user.sub})).map(doc=> doc.toJSON());
                res.json(objs);
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
}

export {setupRoute as default};
