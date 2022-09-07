import { Db } from "mongodb";

const setupDb = (db: Db) => {
    // movie
    db.collection('movie').createIndex({id:1}, {unique: true});

    // tv
    db.collection('tv').createIndex({id:1}, {unique: true});
}

export { setupDb };
