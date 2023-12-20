import download from 'download';
import moment from "moment";
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import zlib from 'zlib';
import {promisify} from 'util';
import { pipeline } from 'stream';
import { chunk } from "lodash";
import { getMovieDetails } from '@/movies/movieDetails';

const movieFileName = 'latestMovie';
const seriesFileName = 'latestSeries';

export const loadMovieDataByDate = async (date: string) => {
    const latest = moment(date).format('MM_DD_YYYY');
    await download(`http://files.tmdb.org/p/exports/movie_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
        filename: `${movieFileName}.json.gz`,
    });

    const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${movieFileName}.json.gz`));
    const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${movieFileName}.json`));
    const unzip = zlib.createGunzip();

    const pipe = promisify(pipeline);
    await pipe(fileContents, unzip, writeStream);
    fileContents.close();
    writeStream.close();
    unzip.close();
}

export const loadSeriesDataByDate = async (date: string) => {
    const latest = moment(date).format('MM_DD_YYYY');
    await download(`http://files.tmdb.org/p/exports/tv_series_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
        filename: `${seriesFileName}.json.gz`,
    });

    const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${seriesFileName}.json.gz`));
    const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${seriesFileName}.json`));
    const unzip = zlib.createGunzip();

    const pipe = promisify(pipeline);
    await pipe(fileContents, unzip, writeStream);
    fileContents.close();
    writeStream.close();
    unzip.close();
}

export const getAllTmdbMovieIds = async () => {
    const latest = moment().subtract(1, 'days').format('MM_DD_YYYY');
    await download(`http://files.tmdb.org/p/exports/movie_ids_${latest}.json.gz`, path.join(__dirname, 'data'), {
        filename: `${movieFileName}.json.gz`,
    });
    
    const fileContents = fs.createReadStream(path.join(__dirname, 'data', `${movieFileName}.json.gz`));
    const writeStream = fs.createWriteStream(path.join(__dirname, 'data', `${movieFileName}.json`));
    const unzip = zlib.createGunzip();

    const pipe = promisify(pipeline);
    await pipe(fileContents, unzip, writeStream);
    const fileStream = fs.createReadStream(path.join(__dirname, 'data', `${movieFileName}.json`));
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    let allMovieIds = [];
    for await (const line of rl) {
        if (JSON.parse(line).popularity >= 10) {
            allMovieIds.push(JSON.parse(line).id);
        }
    }
    return allMovieIds as number[];
}

export const getAllTmdbMovies = async () => {
    const allMovieIds = await getAllTmdbMovieIds();
    const allMovieIdsChunks = chunk(allMovieIds, 80);

    let chunkCount = 1;

    for (let movieIds of allMovieIdsChunks) {
        const getCalls = movieIds.map((movieId) =>
            getMovieDetails(movieId, {
                force: false,
                skipGoogle: true,
                skipRt: true,
            })
        );
        const startTime = Date.now();
        await Promise.all(getCalls);
        const endTime = Date.now();
        console.log(`------ Movies chunk ${chunkCount++} of ${allMovieIdsChunks.length} ------`);
        console.log(`------ time taken ${(endTime - startTime)/1000} sec ------`);
    };
}
