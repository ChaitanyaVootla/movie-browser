export default defineEventHandler(async (event) => {
    const query = getQuery(event)?.query || null;
    if (!query) {
        return [];
    }
    const res: any = await $fetch(`https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${query}`);
    return res.results || [];
});
