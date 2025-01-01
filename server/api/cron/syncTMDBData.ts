import { Movie, Series } from '~/server/models';
import { movieGetHandler } from '../movie/[movieId]';
import { getLatestSeriesData } from '~/server/utils/tmdb_dump';
import { seriesGetHandler } from '../series/[seriesId]';

export default defineEventHandler(async (event) => {
    const isAdmin = event.context.isAdmin as boolean;
    if (!isAdmin) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    syncMovies().then(() => syncSeries());
    return 'Syncing movies and series';
});

export const syncMoviesAndSeries = async () => {
    await syncMovies().then(() => syncSeries());
}

export const syncMovies = async () => {
    const movieData = await getLatestMovieData();
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
        }).select('-_id id updatedAt shallowUpdatedAt').lean();
        console.log(`Found ${dbMovies.length} Movies in DB`);

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
}

export const syncSeries = async () => {
    const seriesData = await getLatestSeriesData();
    console.log(`Read ${seriesData.length} movies from file`);

    const BATCH_SIZE = 1_000;
    const CHUNK_SIZE = 50;
    const COOL_DOWN = 2_000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let MISSING_SERIES = 0;
    let SERIES_TO_UPDATE = 0;

    for (let i = 0; i < seriesData.length; i += BATCH_SIZE) {
        const batch = seriesData.slice(i, i + BATCH_SIZE);
        console.log(`==================== Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(seriesData.length / BATCH_SIZE)}`);
        
        const dbSeries: any = await Series.find({
            id: { $in: batch.map(({ id }) => id) },
        }).select('-_id id updatedAt shallowUpdatedAt').lean();
        console.log(`Found ${dbSeries.length} Series in DB`);

        const dbSeriesById: any = dbSeries.reduce((acc, series) => {
            acc[series.id] = series;
            return acc;
        }, {});

        const missingSeries = batch.filter(({ id }) => !dbSeriesById[id]);
        MISSING_SERIES += missingSeries.length;
        const seriesToUpdate = batch.filter((series) => {
            const dbSeries = dbSeriesById[series.id];
            return dbSeries && new Date(dbSeries.shallowUpdatedAt || dbSeries.updatedAt) <
                new Date(Date.now() - 30 * ONE_DAY);
        });
        SERIES_TO_UPDATE += seriesToUpdate.length - missingSeries.length;

        console.log(`Missing series: ${missingSeries.length}`);
        console.log(`Series to update: ${seriesToUpdate.length}`);

        // for (let j = 0; j < seriesToUpdate.length; j += CHUNK_SIZE) {
        //     const chunk = seriesToUpdate.slice(j, j + CHUNK_SIZE);
        //     console.log(`------------- Updating chunk ${j / CHUNK_SIZE + 1}/${Math.ceil(seriesToUpdate.length / CHUNK_SIZE)}`);
        //     await Promise.all(chunk.map((series) => seriesGetHandler(series.id, true, true, true, true)));
        //     // await 5 secs
        //     await new Promise((resolve) => setTimeout(resolve, COOL_DOWN));
        // }

        for (let j = 0; j < missingSeries.length; j += CHUNK_SIZE) {
            const chunk = missingSeries.slice(j, j + CHUNK_SIZE);
            console.log(`------------- Updating chunk ${j / CHUNK_SIZE + 1}/${Math.ceil(missingSeries.length / CHUNK_SIZE)}`);
            await Promise.all(chunk.map((series) => seriesGetHandler(series.id, true, true, true, true)));
            // await 5 secs
            await new Promise((resolve) => setTimeout(resolve, COOL_DOWN));
        }
    }

    console.log(`Missing series: ${MISSING_SERIES}`);
    console.log(`Series to update: ${SERIES_TO_UPDATE}`);

    return {
        missingSeries: MISSING_SERIES,
        seriesToUpdate: SERIES_TO_UPDATE,
    };
}
