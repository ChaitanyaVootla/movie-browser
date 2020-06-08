const express = require('express')
const app = express()
const cors = require('cors')
const port = 3000
const allKeywords = require('./allKeywords')

app.use(cors())
app.get('/keywords',
    (req, res) => {
        if (req.query.q && req.query.q.length > 1) {
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

app.listen(port, () => console.log(`Server started at port: ${port}`))
