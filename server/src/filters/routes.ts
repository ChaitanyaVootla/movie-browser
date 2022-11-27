import { IGetUserAuthInfoRequest } from '@/auth/utils';
import { ERRORS } from '@/utils/errors';
import { Application, Response } from 'express';
import { Filters, IFilter } from '@/db/schemas/filters';

export const mapDbFilters = (filters: any[]) => {
    // map filters to join deep objects with dot notation
    return filters.map((filter) => {
        const newFilter: any = {};
        Object.entries(filter).forEach(([key, value]) => {
            if (typeof value === 'object') {
                Object.entries(value).forEach(([subKey, subValue]) => {
                    if (typeof subValue === 'string' && !isNaN(parseInt(subValue))) {
                        subValue = parseInt(subValue);
                    }
                    newFilter[`${key}.${subKey}`] = subValue;
                });
            } else {
                newFilter[key] = value;
            }
        });
        return newFilter;
    });
}

const setupRoute = (app: Application) => {
    app.get('/filters', async (req: IGetUserAuthInfoRequest, res) => {
        if (!req.user?.sub) {
            return res.json(ERRORS.UNAUTHORIZED);
        }
        let filters = (await Filters.find({ userId: req.user.sub })).map((doc) => doc.toJSON());
        res.json(mapDbFilters(filters));
    });
    app.post('/filters', async (req: IGetUserAuthInfoRequest, res: Response) => {
        if (req.user?.sub) {
            const filterName = req.body.name;
            const filterToUpdate = await Filters.findOne({ userId: req.user.sub, name: filterName });
            if (filterToUpdate) {
                await Filters.replaceOne(
                    { userId: req.user.sub, name: filterName },
                    {
                        ...req.body,
                        userId: req.user.sub,
                    },
                );
            } else {
                Filters.create({
                    ...req.body,
                    userId: req.user.sub,
                    name: filterName,
                } as IFilter);
            }
            res.send('ok');
        } else {
            res.status(401).json(ERRORS.UNAUTHORIZED);
        }
    });
    app.delete('/filters/:filterName', async (req: IGetUserAuthInfoRequest, res: Response) => {
        if (req.user?.sub) {
            const filterToDelete = await Filters.findOne({ userId: req.user.sub, name: req.params.filterName });
            if (filterToDelete) {
                await filterToDelete.delete();
            }
            res.send('ok');
        } else {
            res.status(401).json(ERRORS.UNAUTHORIZED);
        }
    });
    app.post('/filtersBulk', async (req: IGetUserAuthInfoRequest, res: Response) => {
        if (req.user?.sub) {
            const rawFilters = req.body.data as any[];
            const filtersToPush = rawFilters.map((filter) => ({ ...filter, userId: parseInt(req.user.sub) }));
            try {
                await Filters.insertMany(filtersToPush, { ordered: false });
            } catch (e) {
            } finally {
                res.send('ok');
            }
        } else {
            res.status(401).json(ERRORS.UNAUTHORIZED);
        }
    });
};

export { setupRoute as default };
