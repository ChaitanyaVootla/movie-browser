import { ISeries, Series, SERIES_QUERY_PARAMS } from "~/server/models";
import { getGoogleLambdaData } from "~/server/utils/externalData/googleData";
import { getNewLambdaData } from "~/server/utils/externalData/newLambdaData";
import { combineRatings } from "~/server/utils/ratings/combineRatings";
import { getWatchOptions } from "~/server/utils/watchOptions";
import { JWT } from "next-auth/jwt";
import { TMDB } from "~/server/utils/api";
import { getPrimaryVideoInfo } from "~/utils/video";

const DAY_MILLIS = 1000 * 60 * 60 * 24;
const SEASON_CACHE_TTL = 6 * 60 * 60; // 6 hours in seconds

export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    let isForce = getQuery(event).force ? true : false;
    const checkUpdate = getQuery(event).checkUpdate ? true : false;
    const minimal = getQuery(event).minimal ? true : false;
    let country = getQuery(event).country as string;
    if (!country) {
        country = getHeader(event, 'X-Country-Code') || 'IN';
    }
    const userData = event.context.userData as JWT;

    if (isForce && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }
    if (!seriesId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${seriesId}`);
    }

    const series = await seriesGetHandler(seriesId as string, checkUpdate, isForce, false, false, event, country, minimal);

    if (!series) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${series}`);
    }
    if (series.adult && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    if (minimal && series.name && !isForce) {
        const s = series as any;
        return {
            id: s.id,
            name: s.name,
            backdrop_path: s.backdrop_path,
            poster_path: s.poster_path,
            videos: getPrimaryVideoInfo(s.videos), // Only send primary trailer
            genres: s.genres,
            first_air_date: s.first_air_date,
            last_air_date: s.last_air_date,
            number_of_seasons: s.number_of_seasons,
            status: s.status,
            ratings: s.ratings, // Combined ratings (already processed)
            watch_options: s.watch_options, // Processed watch options for user's region
            vote_average: s.vote_average,
            overview: s.overview,
            next_episode_to_air: s.next_episode_to_air,
            last_episode_to_air: s.last_episode_to_air
        };
    }

    const latestSeasonNumber = series.next_episode_to_air?.season_number || series.last_episode_to_air?.season_number;
    let selectedSeason = {};
    if (latestSeasonNumber && !minimal) {
        selectedSeason = await getCachedSeasonData(seriesId as string, latestSeasonNumber);
    }
    return {
        ...series,
        selectedSeason,
    } as ISeries;
});

export const seriesGetHandler = async (seriesId: string, checkUpdate: boolean, isForce: boolean,
    forceFrequent: boolean, shallowUpdate = false, event?: any, country?: string, minimal = false): Promise<any> => {
    let series = {} as any;
    let canUpdate = false;
    let dbSeries;
    if (country && /^[a-zA-Z]{2}$/.test(country)) {
        const pCountry = country.toUpperCase();
        const pipeline = [
            { $match: { id: parseInt(seriesId) } },
            {
                $addFields: {
                    _wp_tmp: {
                        US: "$watchProviders.US",
                        [pCountry]: `$watchProviders.${pCountry}`
                    }
                }
            },
            {
                $project: {
                    _id: 0, __v: 0, "images.posters": 0, production_companies: 0,
                    production_countries: 0, spoken_languages: 0, similar: 0, watchProviders: 0,
                    ...(minimal ? { credits: 0, recommendations: 0, keywords: 0 } : {})
                }
            },
            { $addFields: { watchProviders: "$_wp_tmp" } },
            { $project: { _wp_tmp: 0 } }
        ];
        // @ts-ignore
        const results = await Series.aggregate(pipeline);
        dbSeries = results[0];
    } else {
        let query = Series.findOne({ id: seriesId })
            .select('-_id -__v -images.posters -production_companies -production_countries -spoken_languages -similar');

        if (minimal) {
            query = query.select('-credits -recommendations -keywords');
        } else {
            query = query.select('-watchProviders');
        }

        dbSeries = await query;
    }

    // @ts-ignore
    if (dbSeries && (dbSeries.name || (dbSeries as any).id)) {
        series = (dbSeries as any).toJSON ? dbSeries.toJSON() : dbSeries;
    }
    if (series?.updatedAt) {
        const sinceUpdate = Date.now() - series.updatedAt;
        const sinceMovieRelase = Date.now() - new Date(series?.next_episode_to_air?.air_date ||
            series?.last_episode_to_air?.air_date ||
            series?.last_air_date ||
            series?.first_air_date
        ).getTime();
        const updateInterval = seriesUpdateInterval(sinceMovieRelase);
        if (sinceUpdate > updateInterval) {
            canUpdate = true;
        }
    }
    if (checkUpdate && canUpdate) {
        isForce = true;
    }
    if (isForce || !series.name) {
        const queryParams = minimal
            ? '&append_to_response=videos,images,external_ids,watch/providers'
            : SERIES_QUERY_PARAMS;

        try {
            const [details, watchProviders]: [any, any] = await Promise.all([
                $fetch(`${TMDB.BASE_URL}/tv/${seriesId}?api_key=${process.env.TMDB_API_KEY}${queryParams}`, {
                    retry: 5,
                }),
                $fetch(`${TMDB.BASE_URL}/tv/${seriesId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`, {
                    retry: 5,
                }),
            ]);
            details.watchProviders = watchProviders.results;
            let googleData = series.googleData || {} as any;
            let externalData = series.external_data || {} as any;

            if (!shallowUpdate) {
                if (details?.external_ids?.imdb_id) {
                    // Call both lambdas in parallel
                    const [oldLambdaResponse, newLambdaResponse] = await Promise.allSettled([
                        getGoogleLambdaData(details),
                        getNewLambdaData(details)
                    ]);

                    // Process old lambda response
                    if (oldLambdaResponse.status === 'fulfilled' && oldLambdaResponse.value) {
                        const lambdaResponse = oldLambdaResponse.value;
                        if (lambdaResponse?.imdbId === details?.external_ids?.imdb_id) {
                            // Merge ratings logic: don't override existing if new is empty, and add on top
                            const newRatings = lambdaResponse.ratings || [];
                            const oldRatings = googleData.ratings || [];

                            if (newRatings.length === 0 && oldRatings.length > 0) {
                                lambdaResponse.ratings = oldRatings;
                            } else if (newRatings.length > 0 && oldRatings.length > 0) {
                                // Merge: keep new ones, add old ones that don't exist in new
                                const mergedRatings = [...newRatings];
                                for (const oldRating of oldRatings) {
                                    if (!mergedRatings.find(r => r.name === oldRating.name)) {
                                        mergedRatings.push(oldRating);
                                    }
                                }
                                lambdaResponse.ratings = mergedRatings;
                            }

                            googleData = lambdaResponse;
                        }
                    }

                    // Process new lambda response
                    if (newLambdaResponse.status === 'fulfilled' && newLambdaResponse.value) {
                        const newLambdaData = newLambdaResponse.value;
                        const newDetailedRatings = newLambdaData.detailedRatings || {};
                        const oldDetailedRatings = externalData.ratings || {};

                        // Merge IMDb
                        if (!newDetailedRatings.imdb && oldDetailedRatings.imdb) {
                            newDetailedRatings.imdb = oldDetailedRatings.imdb;
                        }

                        // Merge Rotten Tomatoes
                        if (oldDetailedRatings.rottenTomatoes) {
                            if (!newDetailedRatings.rottenTomatoes) {
                                newDetailedRatings.rottenTomatoes = oldDetailedRatings.rottenTomatoes;
                            } else {
                                // Deep merge RT (critic/audience)
                                if (!newDetailedRatings.rottenTomatoes.critic && oldDetailedRatings.rottenTomatoes.critic) {
                                    newDetailedRatings.rottenTomatoes.critic = oldDetailedRatings.rottenTomatoes.critic;
                                }
                                if (!newDetailedRatings.rottenTomatoes.audience && oldDetailedRatings.rottenTomatoes.audience) {
                                    newDetailedRatings.rottenTomatoes.audience = oldDetailedRatings.rottenTomatoes.audience;
                                }
                            }
                        }

                        externalData = {
                            ratings: newDetailedRatings,
                            externalIds: { ...(externalData.externalIds || {}), ...(newLambdaData.externalIds || {}) }
                        };
                    }
                }
                if (!googleData?.imdbId && details.googleData) {
                    googleData = series.googleData;
                }
            }
            series = {
                ...details,
                googleData,
                external_data: externalData,
                rottenTomatoes: {},
            };
            if (!shallowUpdate) {
                series.updatedAt = new Date();
            }
        } catch (e) {
            console.error(`Error getting series details for id: ${seriesId}`);
        }
        if (series?.name) {
            await Series.updateOne(
                { id: seriesId },
                {
                    $set: {
                        ...series,
                        shallowUpdatedAt: new Date(),
                    },
                },
                { upsert: true },
            ).exec();
        }
    }

    // Create combined ratings object for response only (not saved to DB)
    const combinedRatings = combineRatings(
        series.googleData,
        series.external_data,
        series.vote_average,
        series.vote_count,
        series.id,
        'tv'
    );

    // Create watch options based on country and available data
    const watchOptions = event ? getWatchOptions(event, series.googleData, series.watchProviders) : [];

    return {
        ...series,
        canUpdate,
        ratings: combinedRatings, // Add ratings only to the response
        watch_options: watchOptions // Add watch options for current country
    }
}

/**
 * Get season data with caching (6-hour TTL)
 */
const getCachedSeasonData = async (seriesId: string, seasonNumber: number): Promise<any> => {
    const cacheKey = `season-${seriesId}-${seasonNumber}`;

    try {
        // Check cache first
        const cachedSeason = await useStorage('seasons').getItem(cacheKey);
        if (cachedSeason) {
            console.log(`✅ Cache hit for season ${seasonNumber} of series ${seriesId}`);
            return cachedSeason;
        }

        console.log(`🔄 Cache miss for season ${seasonNumber} of series ${seriesId}, fetching from TMDB...`);

        // Fetch from TMDB API
        const seasonData: any = await $fetch(`${TMDB.BASE_URL}/tv/${seriesId}/season/${seasonNumber}?api_key=${process.env.TMDB_API_KEY}`, {
            retry: 5,
        });

        // Cache the result for 6 hours
        await useStorage('seasons').setItem(cacheKey, seasonData, { ttl: SEASON_CACHE_TTL });
        console.log(`💾 Cached season ${seasonNumber} of series ${seriesId} for 6 hours`);

        return seasonData;
    } catch (error) {
        console.error(`❌ Error fetching season ${seasonNumber} for series ${seriesId}:`, error);
        return {};
    }
};

const seriesUpdateInterval = (sinceMovieRelase: number) => {
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
