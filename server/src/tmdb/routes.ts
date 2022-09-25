import { IGetUserAuthInfoRequest } from '@/auth/utils';
import { Movie, MovieLightFileds } from '@/db/schemas/Movies';
import { Series, SeriesLightFileds } from '@/db/schemas/Series';
import { tmdbPassthrough } from '@/tmdb/tmdb';
import { ERRORS } from '@/utils/errors';
import { Response } from 'express';

const setupRoute = (app) => {
    app.get('/tmdb/*', async (req, res) => {
        try {
            const tmdbRes = await tmdbPassthrough(req.url.split('/tmdb')[1]);
            res.json(tmdbRes);
        } catch (e) {
            console.error(e);
            res.json(e);
        }
    });
    app.get('/movies', async(req:IGetUserAuthInfoRequest, res: Response) => {
        if (!req.query.movieIds) {
            return res.send(ERRORS.WONG_PARAMS);
        }
        const movieIdsString = req.query.movieIds as String;
        const movieIds = movieIdsString.split(',');
        try {
            const movies = await (await Movie.find({id: {$in: movieIds}})
            .select(MovieLightFileds)).map(doc => doc.toJSON());
            res.json(movies);
        } catch(e) {
            res.status(500).send();
        }
    });
    app.get('/series', async(req:IGetUserAuthInfoRequest, res: Response) => {
        if (!req.query.seriesIds) {
            return res.send(ERRORS.WONG_PARAMS);
        }
        const seriesIdsString = req.query.seriesIds as String;
        const seriesIds = seriesIdsString.split(',');
        try {
            const series = await (await Series.find({id: {$in: seriesIds}})
            .select(SeriesLightFileds)).map(doc => doc.toJSON());
            res.json(series);
        } catch(e) {
            res.status(500).send();
        }
    });
}

export {setupRoute as default};
