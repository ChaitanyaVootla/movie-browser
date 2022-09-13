import { IGetUserAuthInfoRequest } from "@/auth/utils";
import { ERRORS } from "@/utils/errors";
import { Application } from "express";
import { IRecent, Recent } from "@/db/schemas/recents";
import { isEmpty } from "lodash";

const setupRoute = (app: Application) => {
    app.get('/recents',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            const recents = (await Recent.find({userId: req.user.sub})).map(doc => doc.toJSON());
            res.json(recents);
        }
    );
    app.delete('/recents',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            await Recent.deleteMany({userId: req.user.sub});
            res.status(200).send('ok');
        }
    );
    app.post('/recents',
        async (req: IGetUserAuthInfoRequest, res) => {
            if (!req.isAuthenticated) {
                return res.json(ERRORS.UNAUTHORIZED);
            }
            if (!req.body.itemId || (typeof req.body.isMovie != 'boolean')) {
                return res.status(403).json(ERRORS.WONG_PARAMS);
            }
            const itemId = parseInt(req.body.itemId as string);
            const isMovie = req.body.isMovie;
            try {
                const recentObj: IRecent = {
                    userId: parseInt(req.user.sub),
                    itemId,
                    isMovie,
                    updatedAt: new Date(),
                }
                const existing = await Recent.findOne({itemId, isMovie, userId: parseInt(req.user.sub)})
                if (existing) {
                    await existing.delete();
                }
                await Recent.create(recentObj);
                res.status(200).send('ok');

                // clean up
                const excessRecents = await (await Recent.find({userId: req.user.sub}).sort({updatedAt: -1}))
                    .slice(10).map(doc => doc._id);
                await Recent.deleteMany({_id: {$in: excessRecents}})

            } catch(e) {
                console.log(e)
                res.status(500).json(ERRORS.SERVER_ERROR)
            }
        }
    );
}

export {setupRoute as default};
