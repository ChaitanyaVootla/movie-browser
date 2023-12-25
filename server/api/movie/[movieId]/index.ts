import { IMovie, Movie } from "~/server/models";
import { TMDB } from "~/server/utils/api";
import _ from "lodash";

const QUERY_PARAMS = '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids';

export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    if (!movieId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }

    let movie = {} as any;

    const dbMovie = await Movie.findOne({ id: movieId });
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
                collectionDetails.parts = _.sortBy(collectionDetails.parts, ({ release_date }: any) => {
                    return release_date ? release_date : 'zzzz';
                });
                details.collectionDetails = collectionDetails;
            }
            movie = {
                ...details,
                googleData: {},
                rottenTomatoes: {},
                updatedAt: Date.now(),
            };
        } catch (e) {
            console.error(`TMDB get movie failed for id: ${movieId}`, e);
        }

        if (movie?.title) {
            // TODO: Add to db
        }
    }
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    return movie as IMovie;
});
