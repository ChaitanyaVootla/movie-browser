import dotenv from 'dotenv';
import express from 'express';
const app = express();
import cors from 'cors';
const port = 3001;
import tmdbPassthrough from './tmdb/index';

app.use(cors());
dotenv.config();

app.get('/tmdb/*', async (req, res) => {
    try {
        const tmdbRes = await tmdbPassthrough(req.url.split('/tmdb')[1]);
        res.json(tmdbRes);
    } catch (e) {
        res.sendStatus(500);
    }
});

app.listen(port, () => console.log(`Server started at port: ${port}`));
