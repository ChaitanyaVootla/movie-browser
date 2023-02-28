import { Movie } from "@/db/schemas/Movies";
import { Series } from "@/db/schemas/Series";
import download from 'download';
import moment from "moment";
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import zlib from 'zlib';
import {promisify} from 'util';
import { pipeline } from 'stream';

const latestMoviesfileName = 'latestMovie';
const latestSeriesfileName = 'latestSeries';

let lastDownloaded = moment().subtract(5, 'days');

export const getStats = async () => {
    const movieStats = await getMovieStats();
    const seriesStats = await getSeriesStats();
    return {
        ...movieStats,
        ...seriesStats,
    }
};

const getMovieStats = async () => {
    let allTMDBMovieIds = [];
    try {
        if (moment().diff(lastDownloaded, 'days') > 1) {
            const latest = moment().subtract(1, 'days').format('MM_DD_YYYY');
            await download(`http://files.tmdb.org/p/exports/movie_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
                filename: `${latestMoviesfileName}.json.gz`,
            });

            const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${latestMoviesfileName}.json.gz`));
            const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${latestMoviesfileName}.json`));
            const unzip = zlib.createGunzip();

            const pipe = promisify(pipeline);
            await pipe(fileContents, unzip, writeStream)
            lastDownloaded = moment();
        }
        const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${latestMoviesfileName}.json`));
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            allTMDBMovieIds.push(JSON.parse(line).id);
        }
    } catch(e) {
        console.log(e);
    }
    const allDbMovieIdsCount = await Movie.count({});
    const googleDataDbMovieIdsCount = await Movie.count({'googleData.ratings.1': {$exists: true}});
    const googleDataImdbMovieIdsCount = await Movie.count({'external_ids.imdb_id': {$ne: null}});
    return {
        movies: {
            total: allTMDBMovieIds.length,
            db: {
                total: allDbMovieIdsCount,
                imdb: googleDataImdbMovieIdsCount,
                withGoogleData: googleDataDbMovieIdsCount
            },
        }
    }
}

const getSeriesStats = async () => {
    let allTMDBSeriesIds = [];
    try {
        if (moment().diff(lastDownloaded, 'days') > 1) {
            const latest = moment().subtract(1, 'days').format('MM_DD_YYYY');
            await download(`http://files.tmdb.org/p/exports/tv_series_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
                filename: `${latestSeriesfileName}.json.gz`,
            });

            const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${latestSeriesfileName}.json.gz`));
            const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${latestSeriesfileName}.json`));
            const unzip = zlib.createGunzip();

            const pipe = promisify(pipeline);
            await pipe(fileContents, unzip, writeStream)
            lastDownloaded = moment();
        }
        const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${latestSeriesfileName}.json`));
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            allTMDBSeriesIds.push(JSON.parse(line).id);
        }
    } catch(e) {
        console.log(e);
    }
    const allDbSeriesIdsCount = await Series.count({});
    const googleDataDbSeriesIdsCount = await Series.count({'googleData.ratings.1': {$exists: true}});
    const googleDataImdbSeriesIdsCount = await Series.count({'external_ids.imdb_id': {$ne: null}});
    return {
        series: {
            total: allTMDBSeriesIds.length,
            db: {
                total: allDbSeriesIdsCount,
                imdb: googleDataImdbSeriesIdsCount,
                withGoogleData: googleDataDbSeriesIdsCount
            },
        }
    }
}
