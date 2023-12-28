import { IMovie, Movie } from "~/server/models";
import { TMDB } from "~/server/utils/api";
import _ from "lodash";
import { getGoogleLambdaData } from "~/server/utils/externalData/googleData";
import { JWT } from "next-auth/jwt";

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    const isForce = getQuery(event).force? true: false;
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

    const dbMovie = await Movie.findOne({ id: movieId })
        .select('-_id -__v -external_ids -images.posters -production_companies -production_countries -spoken_languages -releaseDates -similar');
    if (dbMovie?.title) {
        movie = dbMovie;
    }

    if (isForce || !movie.title) {
        console.log("Fetching from TMDB")
        try {
            const [details, releaseDates]: [any, any] = await Promise.all([
                $fetch(`${TMDB.BASE_URL}/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}${QUERY_PARAMS}`),
                $fetch(`${TMDB.BASE_URL}/movie/${movieId}/release_dates?api_key=${process.env.TMDB_API_KEY
                    }${QUERY_PARAMS}`),
            ]);
            details.releaseDates = releaseDates.results;
            if (details.belongs_to_collection?.id) {
                const collectionDetails: any = await $fetch(
                    `${TMDB.BASE_URL}/collection/${details.belongs_to_collection.id}?api_key=${process.env.TMDB_API_KEY}`,
                )
                collectionDetails.parts = _.sortBy(collectionDetails.parts, ({ release_date }: any) => {
                    return release_date ? release_date : 'zzzz';
                });
                details.collectionDetails = collectionDetails;
            }
            let googleData = {};
            const lambdaResponse = await getGoogleLambdaData(details);
            if (lambdaResponse?.imdbId === details.imdb_id) {
                googleData = lambdaResponse;
            } else if (details.googleData) {
                googleData = details.googleData;
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
            Movie.updateOne(
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
    return movie as IMovie;
});
