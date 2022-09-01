import { Db } from "mongodb";

const setupDb = (db: Db) => {
    // movie
    db.collection('movie').createIndex({id:1}, {unique: true});
    db.collection('movie').createIndex({imdb_id:1}, {unique: true, sparse: true});

    // tv
    db.collection('tv').createIndex({id:1}, {unique: true});
    db.collection('tv').createIndex({imdb_id:1}, {unique: true, sparse: true});
}

export { setupDb };
