import { Db } from "mongodb";
import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { Response } from "express";
import { getMovieDetails } from "@/db/movieDetails";
import { IWatchedMovie, WatchedMovies } from "@/db/schemas/WatchedMovies";

const setupRoute = (app, db: Db) => {
    app.get('/loadData',
        async(req:IGetUserAuthInfoRequest, res:Response) => {
            if (req.user?.sub) {
                const watchedMovies = (
                    await WatchedMovies.find({userId: req.user.sub}).select('movieId -_id')
                    ).map(doc=> doc.toJSON()) as IWatchedMovie[];
                const watchedMovieIds = watchedMovies.map(({movieId}) => movieId);
                res.json({
                    user: req.user,
                    watchedMovieIds: watchedMovieIds
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
