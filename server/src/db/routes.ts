import { Application } from 'express-serve-static-core';
import { Db } from 'mongodb';

const setupRoute = (app: Application, db: Db) => {
    // app.get('/cleanmongo', async (req, res) => {
    //     try {
    //         await Promise.all([Object.values(dbConstants.collections).map(
    //             collectionName => db.collection(collectionName).drop()
    //         )]);
    //         res.json({message: 'all gone'})
    //     } catch(e) {
    //         console.log(e);
    //     }
    // });
}

export {setupRoute as default};
