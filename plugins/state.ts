export default defineNuxtPlugin(async (app) => {
    const watchedMovies = useState('watchedMovies');
    const watchListMovies = useState('watchListMovies');

    watchedMovies.value = await $fetch('/api/user/movie/watched').catch((err) => {
        console.log(err);
        return [];
    });

    watchListMovies.value = await $fetch('/api/user/movie/watchList').catch((err) => {
        console.log(err);
        return [];
    });
});
