import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { Application } from "express";
import { ContinueWatching, IContinueWatching } from "@/db/schemas/continueWatching";

const setupRoute = (app: Application) => {
    app.get('/continueWatching',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            const continueWatching = (await ContinueWatching.find({userId: req.user.sub})).map(doc => doc.toJSON());
            res.json(continueWatching);
        }
    );
    app.delete('/continueWatching',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            await ContinueWatching.deleteMany({userId: req.user.sub});
            res.status(200).send('ok');
        }
    );
    app.post('/continueWatching',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            if (!req.body.itemId || (typeof req.body.isMovie != 'boolean') || !req.body.watchLink) {
                return res.status(403).json(ERRORS.WONG_PARAMS);
            }
            const itemId = parseInt(req.body.itemId as string);
            const isMovie = req.body.isMovie;
            try {
                const continueWatchingObj: IContinueWatching = {
                    userId: parseInt(req.user.sub),
                    itemId,
                    isMovie,
                    updatedAt: new Date(),
                    watchLink: req.body.watchLink,
                }
                const existing = await ContinueWatching.findOne({itemId, isMovie, userId: parseInt(req.user.sub)})
                if (existing) {
                    await existing.delete();
                }
                await ContinueWatching.create(continueWatchingObj);
                res.status(200).send('ok');

                // clean up
                const excessContinueWatching = await (await ContinueWatching.find({userId: req.user.sub})
                    .sort({updatedAt: -1})).slice(10).map(doc => doc._id);
                await ContinueWatching.deleteMany({_id: {$in: excessContinueWatching}})

            } catch(e) {
                console.log(e)
                res.status(500).json(ERRORS.SERVER_ERROR)
            }
        }
    );
}

export {setupRoute as default};
