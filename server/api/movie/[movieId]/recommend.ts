export default defineEventHandler(async (event) => {
    const movieId = getRouterParam(event, 'movieId');
    const ratingGte = getQuery(event).ratingGte || 0;
    const movies: any = await $fetch('http://127.0.0.1:5000/recommend', {
        method: 'POST',
        body: {
            similarityMovieId: movieId,
            ratingCutoff: ratingGte
        },
    }).catch((error: Error) => {
        return [];
    });
    return movies;
});
