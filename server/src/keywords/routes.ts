import allKeywords from "./allKeywords";

const setupRoute = (app) => {
    app.get('/keywords', (req, res) => {
        if (req.query.q && req.query.q.length > 1) {
            const responseList = [];
            allKeywords.forEach((keyword) => {
                if (keyword.name.indexOf(`${req.query.q}`) !== -1) responseList.push(keyword);
            });
            return res.send(responseList);
        }
        res.sendStatus(400);
    });
}

export {setupRoute as default};
