import { Db } from "mongodb";
import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { WatchedMovies } from "@/db/schemas/WatchedMovies";
import { MoviesWatchList } from "@/db/schemas/MovieWatchList";
import { SeriesList } from "@/db/schemas/seriesList";
import { loadData } from "./loadData";
import { Application, Response } from "express";
import { Users } from "@/db/schemas/User";

const setupRoute = (app: Application, db: Db) => {
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
                const data = await loadData(req.user, db);
                res.json(data);
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
    app.get('/users',
        async(req:IGetUserAuthInfoRequest, res:Response) => {
            if (req.user?.isAdmin) {
                const data = (await Users.find({})).map(doc=> doc.toJSON()) as any[];
                res.json(data);
            } else {
                res.status(401).json(ERRORS.UNAUTHORIZED)
            }
        }
    );
}

export {setupRoute as default};