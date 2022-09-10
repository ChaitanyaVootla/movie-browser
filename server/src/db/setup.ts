import { Db } from "mongodb";
import { dbConstants } from "./constants";

const setupDb = (db: Db) => {
    // users
    db.collection(dbConstants.collections.users).createIndex({id:1}, {unique: true});

    // movie
    db.collection(dbConstants.collections.movies).createIndex({id:1}, {unique: true});
    db.collection(dbConstants.collections.watchedMovies).createIndex({userId:1, movieId: 1}, {unique: true});

    // tv
    db.collection(dbConstants.collections.tv).createIndex({id:1}, {unique: true});
}

export { setupDb };
