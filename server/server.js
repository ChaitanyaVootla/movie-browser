require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const port = 3000;
const allKeywords = require('./allKeywords');
const googleData = require('./api/puppeteer/googleData');
const movieDetails = require('./api/tmdb/movie/getDetails');

app.use(cors());

app.get('/keywords',
    (req, res) => {
        if (req.query.q && req.query.q.length > 1) {
            const responseList = [];
            allKeywords.forEach(
                (keyword) => {
                    if (keyword.name.indexOf(req.query.q) !== -1)
                        responseList.push(keyword);
                }
            );
            return res.send(responseList);
        }
        res.sendStatus(400);
    }
);
app.get('/googleData',
    async (req, res) => {
        try {

            if (req.query.q && req.query.q.length > 1) {
                const gsData = await googleData(req.query.q);
                return res.json(gsData);
            }
            res.sendStatus(400);
        } catch (e) {
            res.sendStatus(500);
        }
    }
);
app.get('/movieDetails/:id',
    async (req, res) => {
        try {
            const details = await movieDetails(req.params.id);
            return res.json(details);
        } catch (e) {
            console.error(e);
            res.sendStatus(500);
        }
    }
);

app.listen(port, () => console.log(`Server started at port: ${port}`));

console.log("========================", process.env.TMDB_API_KEY);
