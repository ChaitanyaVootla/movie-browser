export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    const seasonNumber = getRouterParam(event, 'seasonNumber');
    const episodeNumber = getRouterParam(event, 'episodeNumber');

    const res: any = await $fetch(`https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber
        }/episode/${episodeNumber}?api_key=${process.env.TMDB_API_KEY}&append_to_response=videos,images`);
    return res || {};
});
