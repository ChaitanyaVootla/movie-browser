import getGoogleData from "./search";

const setupRoute = (app) => {
    app.get('/googleData', async (req, res) => {
        try {
            if (req.query.q && req.query.q.length > 1) {
                const gsData = await getGoogleData(req.query.q);;
                return res.json(gsData);
            }
            res.sendStatus(400);
        } catch (e) {
            res.sendStatus(500);
        }
    });
}

export {setupRoute as default};
