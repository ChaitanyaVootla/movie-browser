import { defineStore } from 'pinia'

export const userStore = defineStore('user', {
  state: () => ({
    WatchedMovies: new Set(),
    WatchListMovies: new Set(),
    Recents: [] as any[],
    loadInfo: {} as any,
  }),
  getters: {
    isMovieWatched: (state: any) => (movieId: string) => {
        return state.WatchedMovies.has(movieId);
    },
    isMovieInWatchList: (state: any) => (movieId: string) => {
        return state.WatchListMovies.has(movieId);
    },
    recents: (state: any) => {
        return state.recents;
    },
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
    toggleMovieWatchList(movieId: string) {
        if (this.isMovieInWatchList(movieId)) {
            $fetch(`/api/user/movie/${movieId}/watchList`, {
                method: 'DELETE',
            })
            this.WatchListMovies.delete(movieId);
        } else {
            $fetch(`/api/user/movie/${movieId}/watchList`, {
                method: 'POST',
            })
            this.WatchListMovies.add(movieId);
        }
    },
    async addToRecents(item: any) {
        const englishBackdrop = item?.images?.backdrops?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path
        const newEntry: any = {
            itemId: item.id,
            isMovie: item.title?.length > 0,
            poster_path: item?.poster_path,
            backdrop_path: englishBackdrop || item?.backdrop_path,
            id: item.id,
        }
        if (item.title) {
            newEntry.title = item.title;
        }
        if (item.name) {
            newEntry.name = item.name;
        }
        await $fetch(`/api/user/recents`,
            {
                method: 'POST',
                body: newEntry
            }
        );
        this.Recents = this.Recents.filter((entry) => entry.itemId !== newEntry.itemId);
        this.Recents.unshift(newEntry);
    },
    async setupStore() {
        const [watchedMoviesAPI, watchListMoviesAPI, recentsApi] = await Promise.all([
            $fetch('/api/user/movie/watched').catch((err) => {
                console.log(err);
                return [];
            }),
            $fetch('/api/user/movie/watchList').catch((err) => {
                console.log(err);
                return [];
            }),
            $fetch('/api/user/recents').catch((err) => {
                console.log(err);
                return [];
            }),
        ]);
        this.WatchedMovies = new Set(watchedMoviesAPI);
        this.WatchListMovies = new Set(watchListMoviesAPI);
        this.Recents = recentsApi;
    },
    async loadInfo() {
        this.loadInfo = await $fetch('/api/onLoad');
    }
  },
});

export default defineNuxtPlugin(async (app) => {
});
