export default defineEventHandler(async (event) => {
    const type = getQuery(event)?.type;
    const region = getQuery(event)?.region as string;
    if (!type || !region) {
        return [];
    }
    const res: any = await $fetch(`https://api.themoviedb.org/3/watch/providers/${type}?api_key=${process.env.TMDB_API_KEY
        }&watch_region=${region}`, {
            retry: 3,
        });
    return res.results.map(({ display_priorities, ...provider}: { display_priorities: any}) => provider)
        .sort((a: any, b: any) => a.display_priority - b.display_priority);
});
