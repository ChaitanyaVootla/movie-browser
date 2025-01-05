import { Movie, MovieLightFileds, Series, SeriesLightFileds } from "../models";
import { getObjectSha } from "../utils/crypto";

export default defineEventHandler(async (event) => {
    const params = getQuery(event);
    const query = await readBody(event);
    if (!query || !query?.media_type) {
        return [];
    }

    // Check if the request is cached
    const cachedData = await useStorage('discovery').getItem(getObjectSha({...query, ...params}));
    if (cachedData) {
        return cachedData;
    }

    const queryStr = Object.keys(query)
        .map((key) => {
            const value = query[key];
            if (key === 'with_watch_providers') {
                return `${key}=${value.join('|')}`
            }
            if (key === 'with_keywords') {
                return `${key}=${value.join('|')}`
            }
            return value?`${key}=${value}`:null
        })
        .filter(Boolean)
        .join('&');

    const tmdbRes: any = await $fetch(`https://api.themoviedb.org/3/discover/${query.media_type}?api_key=${process.env.TMDB_API_KEY
        }&${queryStr}`, {
            retry: 5,
        });
    if (params.getFullData) {
        const itemIds = tmdbRes.results.map((movie: any) => movie.id);
        let fullDataRes = [] as any[];
        if (query.media_type === 'tv') {
            fullDataRes = await Series.find({id: {$in: itemIds}}).select(SeriesLightFileds);
        } else {
            fullDataRes = await Movie.find({id: {$in: itemIds}}).select(MovieLightFileds);
        }
        const fullDataItems = fullDataRes.map(movie => movie.toJSON());
        const mappedResults = tmdbRes.results.map((originalItem: any) => {
            return {
                ...fullDataItems.find((item: any) => item.id === originalItem.id),
                ...originalItem
            };
        })
        return {
            ...tmdbRes,
            results: mappedResults
        }
    }
    useStorage('discovery').setItem(getObjectSha(query), tmdbRes);
    return tmdbRes;
});