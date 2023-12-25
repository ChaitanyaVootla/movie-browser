export default defineEventHandler(async (event) => {
    const query = await readBody(event);
    if (!query || !query?.media_type) {
        return [];
    }

    const queryStr = Object.keys(query)
        .map((key) => `${key}=${query[key]}`)
        .join('&');

    const res: any = await $fetch(`https://api.themoviedb.org/3/discover/${query.media_type}?api_key=${process.env.TMDB_API_KEY
        }&query=${queryStr}`);
    return res;
});
