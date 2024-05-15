import { defineStore } from 'pinia'

export const userStore = defineStore('user', {
  state: () => ({
    WatchedMovies: new Set(),
    WatchListMovies: new Set(),
  }),
  getters: {
    isMovieWatched: (state: any) => (movieId: string) => {
        return state.WatchedMovies.has(movieId);
    },
    isMovieInWatchList: (state: any) => (movieId: string) => {
        return state.WatchListMovies.has(movieId);
    }
  },
  actions: {
    toggleWatchMovie(movieId: string) {
        if (this.isMovieWatched(movieId)) {
            $fetch(`/api/user/movie/${movieId}/watched`, {
                method: 'DELETE',
            })
            this.WatchedMovies.delete(movieId);
        } else {
            $fetch(`/api/user/movie/${movieId}/watched`, {
                method: 'POST',
            })
            this.WatchedMovies.add(movieId);
        }
    },
  },
});

export default defineNuxtPlugin(async (app) => {
    const [watchedMoviesAPI, watchListMoviesAPI] = await Promise.all([
        $fetch('/api/user/movie/watched').catch((err) => {
            console.log(err);
            return [];
        }),
        $fetch('/api/user/movie/watchList').catch((err) => {
            console.log(err);
            return [];
        }),
    ]);
    const userData = userStore();
    userData.WatchedMovies = new Set(watchedMoviesAPI);
    userData.WatchListMovies = new Set(watchListMoviesAPI);
});
