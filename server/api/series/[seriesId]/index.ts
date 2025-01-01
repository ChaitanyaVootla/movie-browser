import { ISeries, Series, SERIES_QUERY_PARAMS } from "~/server/models";
import { getGoogleLambdaData } from "~/server/utils/externalData/googleData";
import { JWT } from "next-auth/jwt";

const DAY_MILLIS = 1000 * 60 * 60 * 24;

export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    let isForce = getQuery(event).force? true: false;
    const checkUpdate = getQuery(event).checkUpdate? true: false;
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

    const series = await seriesGetHandler(seriesId as string, checkUpdate, isForce, false);

    if (!series) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${series}`);
    }
    if (series.adult && (!userData || !userData?.sub)) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    const latestSeasonNumber = series.next_episode_to_air?.season_number || series.last_episode_to_air?.season_number;
    let selectedSeason = {};
    if (latestSeasonNumber) {
        selectedSeason = await $fetch(`/api/series/${seriesId}/season/${latestSeasonNumber}`, {
            retry: 5,
        });
    }
    return {
        ...series,
        selectedSeason,
    } as ISeries;
});

export const seriesGetHandler = async (seriesId: string, checkUpdate: boolean, isForce: boolean,
    forceFrequent: boolean, shallowUpdate=false): Promise<any> => {
    let series = {} as any;
    let canUpdate = false;

    const dbSeries = await Series.findOne({ id: seriesId }).select('-_id -__v -images.posters -production_companies -production_countries -spoken_languages -similar -watchProviders');
    // @ts-ignore
    if (dbSeries?.name) {
        series = dbSeries.toJSON();
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
        try {
            const [details, watchProviders]: [any, any] = await Promise.all([
                $fetch(`${TMDB.BASE_URL}/tv/${seriesId}?api_key=${process.env.TMDB_API_KEY}${SERIES_QUERY_PARAMS}`, {
                    retry: 5,
                }),
                $fetch(`${TMDB.BASE_URL}/tv/${seriesId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`, {
                    retry: 5,
                }),
            ]);
            details.watchProviders = watchProviders.results;
            let googleData = series.googleData || {} as any;
            if (!shallowUpdate) {
                if (details?.external_ids?.imdb_id) {
                    const lambdaResponse = await getGoogleLambdaData(details);
                    if (lambdaResponse?.imdbId === details?.external_ids?.imdb_id) {
                        googleData = lambdaResponse;
                    }
                }
                if (!googleData?.imdbId && details.googleData) {
                    googleData = series.googleData;
                }
            }
            series = {
                ...details,
                googleData,
                rottenTomatoes: {},
            };
            if (!shallowUpdate) {
                series.updatedAt = new Date();
            }
        } catch(e) {
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
    return {
        ...series,
        canUpdate,
    }
}

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
