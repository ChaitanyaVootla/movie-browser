export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    const seasonNumber = getRouterParam(event, 'seasonNumber');

    const res: any = await $fetch(`https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber
        }?api_key=${process.env.TMDB_API_KEY}`);
    return res || {};
});
