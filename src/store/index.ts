import Vue from 'vue';
import Vuex from 'vuex';
import { sortBy, random } from 'lodash';
import { api } from '../API/api';
import Timezone from 'countries-and-timezones';

Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        user: {} as any,
        oneTapUser: {},
        history: {
            isLoading: true,
            movies: [],
            series: [],
        },
        recentVisits: [],
        allLoaded: false,
        watched: {
            isLoading: true,
            movies: [],
            movieIds: [],
            movieIdsSet: new Set(),
            series: [],
            seriesIds: [],
        },
        moviesWatchList: [],
        continueWatching: [],
        friends: [],
        watchList: {
            isLoading: true,
            movies: [],
            movieIds: [],
            movieIdsSet: new Set(),
            series: [],
            seriesIds: [],
            seriesIdsSet: new Set(),
        },
        savedFilters: [],
        randomFilters: {},
        sideBarFilters: {
            movieGenres: [],
            seriesGenres: [],
        },
        isLightMode: false,
        isMobile: () => (window.innerWidth > 0 ? window.innerWidth : screen.width) < 767,
    },
    mutations: {
        setUser(state, user) {
            state.user = user;
        },
        setOneTapUser(state, user) {
            state.oneTapUser = user;
        },
        setAllLoaded(state, isLoaded) {
            state.allLoaded = isLoaded;
        },
        setIsLight(state, mode) {
            state.isLightMode = mode;
        },
        setRecentVisits(state, recentVisits) {
            state.recentVisits = recentVisits;
        },
        setHistory(state, { movies, series }) {
            if (movies) {
                state.history.movies = movies;
            }
            if (series) {
                state.history.series = series;
            }
            state.history.isLoading = false;
        },
        setWatched(state, { movies, series }) {
            if (movies) {
                state.watched.movies = movies;
                state.watched.movieIds = movies.map(({ id }) => id);
                state.watched.movieIdsSet = new Set(state.watched.movieIds)
            }
            if (series) {
                state.watched.series = series;
                state.watched.seriesIds = series.map(({ id }) => id);
            }
            state.watched.isLoading = false;
        },
        setContinueWatching(state, items) {
            state.continueWatching = items;
        },
        setFriends(state, friends) {
            state.friends = friends;
        },
        setWatchList(state, { movies, series }) {
            if (movies) {
                state.watchList.movies = movies;
                state.watchList.movieIds = movies.map(({ id }) => id);
                state.watchList.movieIdsSet = new Set(state.watchList.movieIds)
            }
            if (series) {
                state.watchList.series = series;
                state.watchList.seriesIds = series.map(({ id }) => id);
                state.watchList.seriesIdsSet = new Set(state.watchList.seriesIds)
            }
            state.watchList.isLoading = false;
        },
        setSavedFilters(state, savedFilters) {
            state.savedFilters = savedFilters;
        },
        setSideBarFilters(state, { movieGenres, seriesGenres }) {
            state.sideBarFilters.movieGenres = movieGenres;
            state.sideBarFilters.seriesGenres = seriesGenres;
        },
        addWatched(state, id: number) {
            state.watched.movieIdsSet.add(id);
            state.watched.movieIdsSet = new Set(Array.from(state.watched.movieIdsSet))
        },
        deleteWatched(state, id: number) {
            state.watched.movieIdsSet.delete(id);
            state.watched.movieIdsSet = new Set(Array.from(state.watched.movieIdsSet))
        },
        addWatchListMovie(state, {id, details}) {
            state.watchList.movieIdsSet.add(id);
            state.watchList.movieIdsSet = new Set(Array.from(state.watchList.movieIdsSet))
            state.watchList.movies.push({...details, createdAt: new Date()})
            state.watchList.movies = sortBy(state.watchList.movies, 'createdAt').reverse()
        },
        deleteWatchListMovie(state, id: number) {
            state.watchList.movieIdsSet.delete(id);
            state.watchList.movieIdsSet = new Set(Array.from(state.watchList.movieIdsSet))
            state.watchList.movies = state.watchList.movies.filter(({id: movieId}) => movieId !== id)
        },
        addSeriesList(state, {id, details}) {
            state.watchList.seriesIdsSet.add(id);
            state.watchList.seriesIdsSet = new Set(Array.from(state.watchList.seriesIdsSet))
            state.watchList.series.push({...details, createdAt: new Date()})
            state.watchList.series = sortBy(state.watchList.series, 'createdAt').reverse()
        },
        removeSeriesList(state, id: number) {
            state.watchList.seriesIdsSet.delete(id);
            state.watchList.seriesIdsSet = new Set(Array.from(state.watchList.seriesIdsSet))
            state.watchList.series = state.watchList.series.filter(({id: seriesId}) => seriesId !== id)
        },
        addRecent(state, {item, isMovie}) {
            let newRecents = state.recentVisits;
            newRecents = newRecents.filter(({id, isMovie: itemIsMovie}) => !((id == item.id) && (isMovie == itemIsMovie)));
            newRecents.unshift(item);
            state.recentVisits = newRecents
        },
        addContinueWatching(state, {item, isMovie}) {
            let newContinueWatching = state.continueWatching;
            newContinueWatching = newContinueWatching.filter(({id, isMovie: itemIsMovie}) => !((id == item.id) && (isMovie == itemIsMovie)));
            newContinueWatching.unshift(item);
            state.continueWatching = newContinueWatching
        },
    },
    getters: {
        isSignedIn: (state) => state.user.name?true:false,
        user: (state) => state.user,
        oneTapUser: (state) => state.oneTapUser,
        history: (state) => state.history,
        watched: (state) => state.watched,
        recentVisits: (state) => state.recentVisits,
        allLoaded: (state) => state.allLoaded,
        continueWatching: (state) => state.continueWatching,
        watchedMovieById: (state) => (id: number) => state.watched.movieIdsSet.has(id),
        watchListMovieById: (state) => (id: number) => state.watchList.movieIdsSet.has(id),
        watchListSeriesById: (state) => (id: number) => state.watchList.seriesIdsSet.has(id),
        watchListMovies: (state) => state.watchList.movies,
        watchListSeries: (state) => state.watchList.series,
        savedFilters: (state) => state.savedFilters,
        friends: (state) => state.friends,
        sideBarFilters: (state) => state.sideBarFilters,
        canFilterMovies: (state) => state.sideBarFilters.movieGenres.length,
        canFilterSeries: (state) => state.sideBarFilters.seriesGenres.length,
        isLightMode: (state) => state.isLightMode,
        randomFilter: (state) => (identifier) => {
            if (!state.savedFilters.length) {
                return {};
            }
            if (!state.randomFilters[identifier]) {
                state.randomFilters[identifier] = {
                    availableFilters: state.savedFilters,
                };
            }
            const randomFilter = state.randomFilters[identifier]
                .availableFilters[random(0, state.randomFilters[identifier].availableFilters.length - 1)];
            state.randomFilters[identifier].availableFilters = state.randomFilters[identifier]
                .availableFilters.filter((filter) => filter.name !== randomFilter.name);
            return randomFilter;
        },
    },
    actions: {
        init({ commit, state }) {
            api.getUser().then(
                (res) => {
                    let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
                    if ((timeZone.includes('Calcutta'))) {
                        timeZone = timeZone.replace('Calcutta', 'Kolkata');
                    }
                    const country = Timezone.getCountryForTimezone(timeZone)
                    commit('setUser', {...res, country});
                }
            )
            api.getLoadData().then(
                ({watchedMovieIds, watchListMovieIds, watchListMovies, seriesListIds, seriesList, filters, recents,
                    continueWatching}) => {
                    state.watched.movieIdsSet = new Set(watchedMovieIds)
                    state.watchList.movieIdsSet = new Set(watchListMovieIds)
                    state.watchList.movies = sortBy(watchListMovies, 'createdAt').reverse()
                    state.watchList.seriesIdsSet = new Set(seriesListIds)
                    state.watchList.series = seriesList
                    state.savedFilters = filters
                    state.recentVisits = sortBy(recents, 'updatedAt').reverse()
                    state.continueWatching = sortBy(continueWatching, 'updatedAt').reverse()
                }
            )
        },
        async updateFilters({ commit, state }) {
            const filters = await api.getFilters();
            state.savedFilters = filters;
        },
        addWatchedMovie({ commit, state }, id: number) {
            api.addWatched(id);
            commit('addWatched', id);
        },
        delteWatchedMovie({ commit, state }, id: number) {
            api.deleteWatched(id);
            commit('deleteWatched', id);
        },
        addWatchListMovie({ commit, state }, {id, details}: {id: number, details: any}) {
            api.addWatchListMovie(id);
            commit('addWatchListMovie', {id, details});
        },
        deleteWatchListMovie({ commit, state }, id: number) {
            api.deleteWatchListMovie(id);
            commit('deleteWatchListMovie', id);
        },
        addSeriesList({ commit, state }, {id, details}: {id: number, details: any}) {
            api.addSeriesList(id);
            commit('addSeriesList', {id, details});
        },
        removeSeriesList({ commit, state }, id: number) {
            api.removeSeriesList(id);
            commit('removeSeriesList', id);
        },
        addRecent({ commit, state }, {id, isMovie, item}) {
            api.addRecent(id, isMovie);
            commit('addRecent', {item, isMovie});
        },
        addContinueWatching({ commit, state }, {itemId, isMovie, watchLink, item}) {
            api.addContinueWatching({itemId, isMovie, watchLink});
            commit('addContinueWatching', {isMovie, item});
        },
        updateSideBarFilters({ commit }, { movieGenres, seriesGenres }) {
            commit('setSideBarFilters', { movieGenres, seriesGenres });
        },
    },
});

export { store };
