import { Application } from "express";
import { getRottenTomatoesLite } from "./searchLite";

const setupRoute = (app: Application) => {
    app.get('/rottenTomatoes', async (req, res) => {
        try {
            if (req.query.q && req.query.q.length > 1) {
                const rtData = await getRottenTomatoesLite(req.query.q as string);;
                return res.send(rtData);
            }
            res.sendStatus(400);
        } catch (e) {
            res.sendStatus(500);
        }
    });
}

export {setupRoute as default};
