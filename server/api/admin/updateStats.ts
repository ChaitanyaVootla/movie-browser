import axios from 'axios';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Movie } from '~/server/models';
import { movieGetHandler } from '../movie/[movieId]';

export default defineEventHandler(async (event) => {
    const isAdmin = event.context.isAdmin as boolean;
    if (!isAdmin) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    const getSafeDate = () => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        let month: any = date.getMonth() + 1;
        if (month < 10) {
            month = `0${month}`;
        }
        let day: any = date.getDate();
        if (day < 10) {
            day = `0${day}`;
        }
        return `${month}_${day}_${date.getFullYear()}`;
    };

    const downloadAndUnzipFileIfNotExists = async (url: string, filePath: string, unzippedFilePath: string) => {
        if (!fs.existsSync(unzippedFilePath)) {
            console.log(`Downloading and unzipping: ${url}`);
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const decompressed = zlib.gunzipSync(buffer);
            fs.writeFileSync(unzippedFilePath, decompressed);
            console.log(`File downloaded and unzipped to: ${unzippedFilePath}`);
        } else {
            console.log(`Unzipped file already exists: ${unzippedFilePath}`);
        }
    };

    const readFileLineByLine = async (filePath: string): Promise<any[]> => {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        const items: any[] = [];
        for await (const line of rl) {
            if (line.trim()) {
                items.push(JSON.parse(line.trim()));
            }
        }
        return items;
    };

    const formattedDate = getSafeDate();
    const dataDir = path.resolve('./data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const gzFilePath = path.join(dataDir, `movie_ids_${formattedDate}.json.gz`);
    const unzippedFilePath = path.join(dataDir, `movie_ids_${formattedDate}.json`);

    const urls = {
        movies: `http://files.tmdb.org/p/exports/movie_ids_${formattedDate}.json.gz`,
        series: `http://files.tmdb.org/p/exports/tv_series_ids_${formattedDate}.json.gz`,
    };

    await downloadAndUnzipFileIfNotExists(urls.movies, gzFilePath, unzippedFilePath);

    console.log(`Reading file: ${unzippedFilePath}`);
    const movieData = await readFileLineByLine(unzippedFilePath);
    console.log(`Read ${movieData.length} movies from file`);

    const BATCH_SIZE = 1_000;
    const CHUNK_SIZE = 50;
    const COOL_DOWN = 2_000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let MISSING_MOVIES = 0;
    let MOVIES_TO_UPDATE = 0;

    for (let i = 0; i < movieData.length; i += BATCH_SIZE) {
        const batch = movieData.slice(i, i + BATCH_SIZE);
        console.log(`==================== Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(movieData.length / BATCH_SIZE)}`);
        
        const dbMovies: any = await Movie.find({
            id: { $in: batch.map((movie) => movie.id) },
        }).select('-_id id title updatedAt shallowUpdatedAt').lean();
        console.log(`Found ${dbMovies.length} movies in DB`);

        const dbMoviesById: any = dbMovies.reduce((acc, movie) => {
            acc[movie.id] = movie;
            return acc;
        }, {});

        const missingMovies = batch.filter((movie) => !dbMoviesById[movie.id]);
        MISSING_MOVIES += missingMovies.length;
        const moviesToUpdate = batch.filter((movie) => {
            const dbMovie = dbMoviesById[movie.id];
            return dbMovie && new Date(dbMovie.shallowUpdatedAt || dbMovie.updatedAt) <
                new Date(Date.now() - 30 * ONE_DAY);
        });
        MOVIES_TO_UPDATE += moviesToUpdate.length - missingMovies.length;

        console.log(`Missing movies: ${missingMovies.length}`);
        console.log(`Movies to update: ${moviesToUpdate.length}`);

        // for (let j = 0; j < moviesToUpdate.length; j += CHUNK_SIZE) {
        //     const chunk = moviesToUpdate.slice(j, j + CHUNK_SIZE);
        //     console.log(`------------- Updating chunk ${j / CHUNK_SIZE + 1}/${Math.ceil(moviesToUpdate.length / CHUNK_SIZE)}`);
        //     await Promise.all(chunk.map((movie) => movieGetHandler(movie.id, true, true, true, true)));
        //     // await 5 secs
        //     await new Promise((resolve) => setTimeout(resolve, COOL_DOWN));
        // }

        for (let j = 0; j < missingMovies.length; j += CHUNK_SIZE) {
            const chunk = missingMovies.slice(j, j + CHUNK_SIZE);
            console.log(`------------- Updating chunk ${j / CHUNK_SIZE + 1}/${Math.ceil(missingMovies.length / CHUNK_SIZE)}`);
            await Promise.all(chunk.map((movie) => movieGetHandler(movie.id, true, true, true, true)));
            // await 5 secs
            await new Promise((resolve) => setTimeout(resolve, COOL_DOWN));
        }
    }

    console.log(`Missing movies: ${MISSING_MOVIES}`);
    console.log(`Movies to update: ${MOVIES_TO_UPDATE}`);

    return {
        missingMovies: MISSING_MOVIES,
        moviesToUpdate: MOVIES_TO_UPDATE,
    };
});
