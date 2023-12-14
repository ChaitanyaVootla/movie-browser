export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    const movie: any = await $fetch(`https://themoviebrowser.com/node/movieDetails/${movieId}`).catch((error: Error) => {
        return {};
    });
    if (!movie) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Movie not found for id: ${movieId}`);
    }
    return movie;
});
