export default defineEventHandler(async (event) => {
    const query = getQuery(event)?.query || null;
    if (!query) {
        return [];
    }
    const res: any = await $fetch(`https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY
        }&query=${query}`, {
            retry: 3,
        });
    return res.results?.filter(({ media_type }: any) => media_type !== 'collection') || [];
});
