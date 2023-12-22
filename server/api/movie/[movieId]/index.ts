import { IMovie } from "~/server/models";
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { TMDB } from "~/server/utils/api";
import sortBy from "lodash/sortBy";

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }

    let movie = {} as any;

    // dynamoDB
    const dynamoDB = new DynamoDB.DocumentClient();
    const { Item: dbMovie } = await dynamoDB.get({
        TableName: 'movies',
        Key: {
            id: movieId,
        },
    }).promise();

    if (dbMovie?.title) {
        movie = dbMovie;
    }
    if (!movie.title) {
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
                collectionDetails.parts = sortBy(collectionDetails.parts, ({ release_date }: any) => {
                    return release_date ? release_date : 'zzzz';
                });
                details.collectionDetails = collectionDetails;
            }
            movie = {
                ...details,
                googleData: {},
                rottenTomatoes: {},
                updatedAt: new Date(),
            };
        } catch (e) {
            console.error(`TMDB get movie failed for id: ${movieId}`, e);
        }

        if (movie?.title) {
            await dynamoDB.put({
                TableName: 'movies',
                Item: {
                    ...movie,
                    id: `${movieId}`,
                },
            }).promise();
        }
    }
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    return movie as IMovie;
});
