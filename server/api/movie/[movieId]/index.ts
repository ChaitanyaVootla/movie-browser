import { IMovie, Movie } from "~/server/models";
import { TMDB } from "~/server/utils/api";
import _ from "lodash";
import { getGoogleLambdaData } from "~/server/utils/externalData/googleData";
import { JWT } from "next-auth/jwt";

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

const DAY_MILLIS = 1000 * 60 * 60 * 24;

export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    let isForce = getQuery(event).force? true: false;
    const checkUpdate = getQuery(event).checkUpdate? true: false;
    const userData = event.context.userData as JWT;

    if (isForce && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }

    let movie = {} as any;
    let canUpdate = false;

    const dbMovie = await Movie.findOne({ id: movieId })
        .select('-_id -__v -external_ids -images.posters -production_companies -production_countries -spoken_languages -releaseDates');
    if (dbMovie?.title) {
        movie = dbMovie.toJSON();
    }

    if (movie?.updatedAt) {
        const sinceUpdate = Date.now() - movie.updatedAt;
        const sinceMovieRelase = Date.now() - new Date(movie.release_date).getTime();
        const updateInterval = movieUpdateInterval(sinceMovieRelase);
        if (sinceUpdate > updateInterval) {
            canUpdate = true;
        }
    }
    if (checkUpdate && canUpdate) {
        isForce = true;
    }

    if (isForce || !movie.title) {
        console.log("Fetching from TMDB")
        try {
            const [details, releaseDates, watchProviders]: [any, any, any] = await Promise.all([
                $fetch(`${TMDB.BASE_URL}/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}${QUERY_PARAMS}`, {
                    retry: 5,
                }),
                $fetch(`${TMDB.BASE_URL}/movie/${movieId}/release_dates?api_key=${process.env.TMDB_API_KEY}`, {
                    retry: 5,
                }),
                $fetch(`${TMDB.BASE_URL}/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`, {
                    retry: 5,
                }),
            ]);
            details.releaseDates = releaseDates.results;
            details.watchProviders = watchProviders.results;
            if (details.belongs_to_collection?.id) {
                const collectionDetails: any = await $fetch(
                    `${TMDB.BASE_URL}/collection/${details.belongs_to_collection.id}?api_key=${process.env.TMDB_API_KEY}`,
                    {
                        retry: 5,
                    }
                )
                collectionDetails.parts = _.sortBy(collectionDetails.parts, ({ release_date }: any) => {
                    return release_date ? release_date : 'zzzz';
                });
                details.collectionDetails = collectionDetails;
            }
            let googleData = movie.googleData || {} as any;
            if (details.imdb_id) {
                const lambdaResponse = await getGoogleLambdaData(details);
                if (lambdaResponse?.imdbId === details.imdb_id) {
                    googleData = lambdaResponse;
                }
            }
            movie = {
                ...details,
                googleData,
                rottenTomatoes: {},
                updatedAt: Date.now(),
            };
        } catch (e) {
            console.error(`TMDB get movie failed for id: ${movieId}`, e);
        }

        if (movie?.title) {
            await Movie.updateOne(
                { id: movieId },
                {
                    $set: {
                        ...movie,
                        updatedAt: new Date(),
                    },
                },
                { upsert: true },
            ).exec();
        }
    }
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    movie.canUpdate = canUpdate;
    console.error(movie.adult, (!userData || !userData?.sub));
    if (movie.adult && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    return movie as IMovie;
});

const movieUpdateInterval = (sinceMovieRelase: number) => {
    if (sinceMovieRelase < DAY_MILLIS * 14) {
        return DAY_MILLIS;
    }
    if (sinceMovieRelase < DAY_MILLIS * 30) {
        return DAY_MILLIS * 4;
    }
    if (sinceMovieRelase < DAY_MILLIS * 90) {
        return DAY_MILLIS * 7;
    }
    return DAY_MILLIS * 30;
}
