import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
const app = express();
import cors from 'cors';
const port = 3000;
import { Db, MongoClient } from 'mongodb';
import allKeywords from './allKeywords';
import googleData from './api/puppeteer/googleData';
import { getMovieDetails } from './db/movieDetails';
import { tmdbPassthrough } from './tmdb/tmdb';
import { setupDb } from './db/setup';
import { getTVDetails } from './db/tvDetails';
const passport = require('passport');
import expressSession from 'express-session';
require('./passport');

app.use(expressSession({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.IS_PROD?.length > 0 }
}));
app.use(passport.initialize());
app.use(passport.session());

const mongoUser = `${process.env.MONGO_USER?process.env.TMDB_API_KEY:'root'}`;
const mongoPass = `${process.env.MONGO_PASS?process.env.MONGO_PASS:'rootpassword'}`;
const dbUri = `mongodb://${mongoUser}:${mongoPass}@${process.env.IS_PROD?.length?'mongodb_container':'localhost'}:27017`;
const dbClient = new MongoClient(dbUri);
let db:Db;
dbClient.connect().then(() => {
    console.log("SETUP DB COMPLETE")
    db = dbClient.db('test');
    setupDb(db);
}).catch((e) => {
    console.error(e);
});
app.use(cors());

// Auth
app.get('/auth' , passport.authenticate('google', { scope:
    [ 'email', 'profile' ]
}));

// Auth Callback
app.get( '/auth/callback',
    passport.authenticate( 'google', {
        successRedirect: '/auth/callback/success',
        failureRedirect: '/auth/callback/failure'
}));

// Success
app.get('/auth/callback/success' , (req:any , res) => {
    if(!req.user)
        return res.redirect('/auth/callback/failure');
    res.redirect('/');
});

// failure
app.get('/auth/callback/failure' , (req , res) => {
    res.send("Error");
});

app.get("/logout", (req:any, res) => {
    req.logout((err) => {
        if (err) { return console.error(err); }
        res.redirect('/');
    });
})

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
app.get('/googleData', async (req, res) => {
    try {
        if (req.query.q && req.query.q.length > 1) {
            const gsData = await googleData(req.query.q);
            return res.json(gsData);
        }
        res.sendStatus(400);
    } catch (e) {
        res.sendStatus(500);
    }
});

app.get('/tmdb/*', async (req, res) => {
    try {
        const tmdbRes = await tmdbPassthrough(req.url.split('/tmdb')[1]);
        res.json(tmdbRes);
    } catch (e) {
        console.error(e);
        res.json(e);
    }
});
app.get('/cleanmongo', async (req, res) => {
    try {
        const docs = await db.collection('movie').drop();
        res.json(docs)
    } catch(e) {
        console.log(e);
    }
})
app.get('/movieDetails/:id',
    async (req, res) => {
        try {
            const movieId = parseInt(req.params.id);
            const details = await getMovieDetails(db, movieId);
            return res.json(details);
        } catch (e) {
            console.error(e);
            res.sendStatus(500);
        }
    }
);
app.get('/tvDetails/:id',
    async (req, res) => {
        try {
            const tvId = parseInt(req.params.id);
            const details = await getTVDetails(db, tvId);
            return res.json(details);
        } catch (e) {
            console.error(e);
            res.sendStatus(500);
        }
    }
);

app.listen(port, () => console.log(`Server started at port: ${port}`));

// on unhandled rejection
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection reason:', reason);
}).on('uncaughtException', (err) => {
    console.log('Uncaught Exception thrown:', err);
}).on('SIGINT', () => {
    console.log('SIGINT');
    process.exit(0);
});
