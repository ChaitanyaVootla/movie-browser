export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    const movies: any = await $fetch('http://127.0.0.1:5000/recommend', {
        method: 'POST',
        body: {
            similarityMovieId: movieId,
        },
    }).catch((error: Error) => {
        return [];
    });
    return movies;
});
