import { IGetUserAuthInfoRequest } from '@/auth/utils';
import { ISeriesList, SeriesList } from '@/db/schemas/seriesList';
import { getTVDetails } from '@/series/seriesDetails';
import { ERRORS } from '@/utils/errors';
import { Application, Response } from 'express';

const setupRoute = (app: Application) => {
    app.get('/seriesDetails/:id',
        async (req: IGetUserAuthInfoRequest, res) => {
            try {
                const tvId = parseInt(req.params.id);
                const details = await getTVDetails(
                    tvId,
                    {
                        force: req.query.force && req.isAuthenticated,
                    },
                );
                return res.json(details);
            } catch (e) {
                console.error(e);
                res.sendStatus(500);
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
    app.post('/seriesList/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
            if (!req.isAuthenticated) {
                return res.status(401).json(ERRORS.UNAUTHORIZED)
            }
            const seriesId = parseInt(req.params.id);
            const objectToAdd: ISeriesList = 
            {
                seriesId,
                userId: parseInt(req.user.sub),
                createdAt: new Date(),
            };
            const newEntry = new SeriesList(objectToAdd);
            try {
                await newEntry.save();
                res.status(200).send();
            } catch(e) {
                console.error(e);
                res.status(500).json(ERRORS.SERVER_ERROR)
            }
        }
    );
    app.delete('/seriesList/:id',
        async (req: IGetUserAuthInfoRequest, res: Response) => {
            if (!req.isAuthenticated) {
                return res.status(401).json(ERRORS.UNAUTHORIZED)
            }
            const objectToDelete = {
                seriesId: parseInt(req.params.id),
                userId: parseInt(req.user.sub),
            };
            try {
                await SeriesList.deleteOne(objectToDelete)
                res.status(200).send();
            } catch(e) {
                console.error(e);
                res.status(500).json(ERRORS.SERVER_ERROR)
            }
        }
    );
}

export {setupRoute as default};
