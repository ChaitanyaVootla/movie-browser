import { Db } from 'mongodb';
import { dbConstants } from './constants';
import { getMovieDetails } from './movieDetails';
import { getTVDetails } from './tvDetails';

const setupRoute = (app, db: Db) => {
    app.get('/cleanmongo', async (req, res) => {
        try {
            await Promise.all([Object.values(dbConstants.collections).map(
                collectionName => db.collection(collectionName).drop()
            )]);
            res.json({message: 'all gone'})
        } catch(e) {
            console.log(e);
        }
    });
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
    app.get('/tvDetails/:id',
        async (req, res) => {
            try {
                const tvId = parseInt(req.params.id);
                const details = await getTVDetails(tvId);
                return res.json(details);
            } catch (e) {
                console.error(e);
                res.sendStatus(500);
            }
        }
    );
}

export {setupRoute as default};
