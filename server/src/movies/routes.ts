import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { Application, Response } from "express";
import { getMovieDetails } from "@/movies/movieDetails";
import { IWatchedMovie, WatchedMovies } from "@/db/schemas/WatchedMovies";
import { IMoviesWatchList, MoviesWatchList } from "@/db/schemas/MovieWatchList";

const setupRoute = (app: Application) => {
    app.get('/movieDetails/:id',
        async (req, res) => {
            try {
                const movieId = parseInt(req.params.id);
                const details = await getMovieDetails(movieId);
                return res.json(details);
            } catch (e) {
                console.error(e);
                res.sendStatus(500);
            }
        }
    );
    app.post('/watchedMovies/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
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
    app.delete('/watchedMovies/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
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
    app.post('/watchListMovie/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const movieId = parseInt(req.params.id);
                const objectToAdd: IMoviesWatchList = 
                {
                    movieId,
                    userId: parseInt(req.user.sub),
                    createdAt: new Date(),
                };
                const newEntry = new MoviesWatchList(objectToAdd);
                await newEntry.save().catch(()=>{});
                getMovieDetails(movieId);
                res.status(200).send();
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.delete('/watchListMovie/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
            if (req.user?.sub) {
                const objectToDelete = 
                    {
                        movieId: parseInt(req.params.id),
                        userId: parseInt(req.user.sub),
                    };
                await MoviesWatchList.deleteOne(objectToDelete)
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
}

export {setupRoute as default};
