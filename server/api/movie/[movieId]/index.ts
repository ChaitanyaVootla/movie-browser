import { IMovie, Movie } from "~/server/models";
import { TMDB } from "~/server/utils/api";
import _ from "lodash";
import { getGoogleLambdaData } from "~/server/utils/externalData/googleData";
import { getNewLambdaData } from "~/server/utils/externalData/newLambdaData";
import { combineRatings } from "~/server/utils/ratings/combineRatings";
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
    const movie = await movieGetHandler(movieId as string, checkUpdate, isForce, false);
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    if (movie.adult && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }
    return movie;
});

export const movieGetHandler = async (movieId: string, checkUpdate: boolean, isForce: boolean,
    forceFrequent: boolean, shallowUpdate=false): Promise<IMovie> => {
    let movie = {} as any;
    let canUpdate = false;

    const dbMovie = await Movie.findOne({ id: movieId })
        .select('-_id -__v -external_ids -images.posters -production_companies -production_countries -spoken_languages -releaseDates -watchProviders');
    if (dbMovie?.title) {
        movie = dbMovie.toJSON();
    }

    if (movie?.updatedAt) {
        const sinceUpdate = Date.now() - movie.updatedAt;
        const sinceMovieRelase = Date.now() - new Date(movie.release_date).getTime();
        let updateInterval = movieUpdateInterval(sinceMovieRelase);
        if (forceFrequent) {
            updateInterval = DAY_MILLIS / 2;
        }
        if (sinceUpdate > updateInterval) {
            canUpdate = true;
        }
    }
    if (checkUpdate && canUpdate) {
        isForce = true;
    }

    if (isForce || !movie.title) {
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
            let externalData = movie.external_data || {} as any;
            
            if (!shallowUpdate) {
                if (details.imdb_id || details.directorName) {
                    const movieDirectorName = details.credits.crew.find(({ job }: any) => job === 'Director')?.name;
                    
                    // Call both lambdas in parallel
                    const [oldLambdaResponse, newLambdaResponse] = await Promise.allSettled([
                        getGoogleLambdaData(details),
                        getNewLambdaData(details)
                    ]);
                    
                    // Process old lambda response
                    if (oldLambdaResponse.status === 'fulfilled' && oldLambdaResponse.value) {
                        const lambdaResponse = oldLambdaResponse.value;
                        if ((lambdaResponse?.imdbId === details.imdb_id) || (lambdaResponse?.directorName === movieDirectorName)) {
                            googleData = lambdaResponse;
                        }
                    }
                    
                    // Process new lambda response
                    if (newLambdaResponse.status === 'fulfilled' && newLambdaResponse.value) {
                        const newLambdaData = newLambdaResponse.value;
                        externalData = {
                            ratings: newLambdaData.detailedRatings || {},
                            externalIds: newLambdaData.externalIds || {}
                        };
                    }
                }
            }
            movie = {
                ...details,
                googleData,
                external_data: externalData,
                rottenTomatoes: {},
            };
            if (!shallowUpdate) {
                movie.updatedAt = new Date();
            }
        } catch (e) {
            console.error(`TMDB get movie failed for id: ${movieId}`, e);
        }

        if (movie?.title) {
            await Movie.updateOne(
                { id: movieId },
                {
                    $set: {
                        ...movie,
                        shallowUpdatedAt: new Date(),
                    },
                },
                { upsert: true },
            ).exec();
        }
    }
    
    // Create combined ratings object for response only (not saved to DB)
    const combinedRatings = combineRatings(
        movie.googleData, 
        movie.external_data, 
        movie.vote_average, 
        movie.vote_count,
        movie.id, 
        'movie'
    );
    
    movie.canUpdate = canUpdate;
    return {
        ...movie,
        ratings: combinedRatings // Add ratings only to the response
    } as IMovie;
}

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
