const express = require('express')
const app = express()
const cors = require('cors')
const port = 3000
const allKeywords = require('./allKeywords')
const googleData = require('./puppeteer/googleData')

app.use(cors())
app.get('/keywords',
    (req, res) => {
        if (req.query.q && req.query.q.length > 1) {
            console.log(req.query.q);
            const responseList = [];
            allKeywords.forEach(
                (keyword) => {
                    if (keyword.name.indexOf(req.query.q) !== -1)
                        responseList.push(keyword);
                }
            )
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

app.listen(port, () => console.log(`Server started at port: ${port}`))
