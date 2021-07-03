const express = require('express')
const app = express()
const cors = require('cors')
const port = 3300
const googleData = require('./googleData')
var url = require('url');

app.use(cors())
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
