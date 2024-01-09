export default defineEventHandler(async (event) => {
    const query = (getQuery(event)?.query || null) as string | null;
    if (!query) {
        return [];
    }

    const res: any = await $fetch(`${TMDB.BASE_URL}/search/person?query=${query}&api_key=${process.env.TMDB_API_KEY}`);
    return res.results || [];
});
