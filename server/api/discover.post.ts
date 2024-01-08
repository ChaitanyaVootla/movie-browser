import _ from "lodash";

export default defineEventHandler(async (event) => {
    const query = await readBody(event);
    if (!query || !query?.media_type) {
        return [];
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

    return $fetch(`https://api.themoviedb.org/3/discover/${query.media_type}?api_key=${process.env.TMDB_API_KEY
        }&query=${queryStr}`, {
            retry: 5,
        });
});
