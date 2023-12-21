import dotenv from 'dotenv';
dotenv.config();

import 'module-alias/register';
import express from 'express';
const app = express();
import cors from 'cors';
const port = 3001;
import { Db, MongoClient } from 'mongodb';
import bodyParser from 'body-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { authInjector } from '@/auth/middleware';
import { IGetUserAuthInfoRequest } from '@/auth/utils';
import cron from 'node-cron';

// routes
import watchedMoviesRoutes from './src/userData/routes';
import authRoutes from '@/auth/routes';
import keywordRoutes from '@/keywords/routes';
import tmdbRoutes from '@/tmdb/routes';
import dbRoutes from '@/db/routes';
import aiRoutes from '@/ai/routes';
import moviesRoutes from '@/movies/routes';
import seriesRoutes from '@/series/routes';
import filtersRoutes from '@/filters/routes';
import cronRoutes from '@/cron/routes';
import recentsRoutes from '@/recents/routes';
import continueWatchingRoutes from '@/continueWatching/routes';
import rottenTomatoesRoutes from '@/rottenTomatoes/routes';
import { updateSeriesList } from '@/cron/series';
import moment from 'moment';
import { setupDb } from '@/db/setup';

const mongoUser = `${process.env.MONGO_USER?process.env.TMDB_API_KEY:'root'}`;
const mongoPass = `${process.env.MONGO_PASS?process.env.MONGO_PASS:'rootpassword'}`;
const dbUri = `mongodb://${mongoUser}:${mongoPass}@${process.env.IS_PROD?.length?'mongodb_container':'localhost'}:27017`;
const dbClient = new MongoClient(dbUri);
let db:Db;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin : "http://localhost:8080",
    credentials: true,
}));
app.use(session({
    secret: process.env.SESSION_SECRET,
    name: 'googleonetap',
    store: MongoStore.create({mongoUrl: dbUri}),
    resave: false,
    saveUninitialized: false,
    cookie: {
        // secure: process.env.IS_PROD?.length > 0,
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000, // a week of login
    }
}));

dbClient.connect().then(() => {
    db = dbClient.db('test');

    // inject user
    app.use((req:IGetUserAuthInfoRequest, res, next) => authInjector(req, res, next));

    mongoose.connect(dbUri).then(() => {
        console.log("mongoose connected")
        setupDb(db);
        // setup routes
        watchedMoviesRoutes(app, db);
        authRoutes(app);
        keywordRoutes(app);
        tmdbRoutes(app);
        moviesRoutes(app);
        seriesRoutes(app);
        filtersRoutes(app);
        cronRoutes(app);
        recentsRoutes(app);
        continueWatchingRoutes(app);
        rottenTomatoesRoutes(app);
        dbRoutes(app, db);
        aiRoutes(app, db);
    
        app.listen(port, () => console.log(`Server started at port: ${port}`));

        console.log("setting up cron");
        cron.schedule('0 3 * * *', () => {
            console.log("updating series list for cron job, time:", moment().format('dddd MMMM Do YYYY, h:mm:ss a'))
            updateSeriesList();
        }, {
            scheduled: true,
            timezone: 'Asia/Kolkata'
        })
    });
}).catch((e) => {
    console.error(e);
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection reason:', reason);
}).on('uncaughtException', (err) => {
    console.log('Uncaught Exception thrown:', err);
}).on('SIGINT', () => {
    console.log('SIGINT');
    process.exit(0);
});