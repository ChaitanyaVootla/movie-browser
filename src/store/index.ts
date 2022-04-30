import Vue from 'vue';
import Vuex from 'vuex';
import { firebase, db } from '../Common/firebase';
import { sortBy, omit } from 'lodash';
import moment from 'moment';
import { api } from '../API/api';
import { HISTORY_OMIT_VALUES } from '../Common/constants';
Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        user: {},
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
            series: [],
            seriesIds: [],
        },
        savedFilters: [],
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
            }
            if (series) {
                state.watchList.series = series;
                state.watchList.seriesIds = series.map(({ id }) => id);
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
    },
    getters: {
        user: (state) => state.user,
        history: (state) => state.history,
        watched: (state) => state.watched,
        watchedMovieIds: (state) => state.watched.movieIds,
        recentVisits: (state) => state.recentVisits,
        allLoaded: (state) => state.allLoaded,
        continueWatching: (state) => state.continueWatching,
        watchedSeriesIds: (state) => state.watched.seriesIds,
        watchedMovieById: (state) => (id) => state.watched.movies.find((movie) => movie.id === id),
        watchListMovieById: (state) => (id) => state.watchList.movies.find((movie) => movie.id === id),
        watchListSeriesById: (state) => (id) => state.watchList.series.find((series) => series.id === id),
        watchListMovies: (state) => state.watchList.movies,
        watchListSeries: (state) => state.watchList.series,
        savedFilters: (state) => state.savedFilters,
        friends: (state) => state.friends,
        sideBarFilters: (state) => state.sideBarFilters,
        canFilterMovies: (state) => state.sideBarFilters.movieGenres.length,
        canFilterSeries: (state) => state.sideBarFilters.seriesGenres.length,
        isLightMode: (state) => state.isLightMode,
    },
    actions: {
        initFirebase({ commit }) {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    commit('setUser', user);
                    const userDbRef = db.collection('users').doc(user.uid);
                    await userDbRef.set({
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                    });
                    // userDbRef.collection('moviesHistory').onSnapshot(
                    //     snapshot => {
                    //         const movies = [];
                    //         snapshot.forEach(
                    //             doc => doc.id == doc.data().id?movies.push(doc.data()):''
                    //         );
                    //         commit('setHistory', {
                    //             movies: sortBy(movies, 'updatedAt').reverse(),
                    //         });
                    //     }, (e) => console.error(e)
                    // );
                    // userDbRef.collection('seriesHistory').onSnapshot(
                    //     snapshot => {
                    //         const series = [];
                    //         snapshot.forEach(
                    //             doc => doc.id == doc.data().id?series.push(doc.data()):''
                    //         );
                    //         commit('setHistory', {
                    //             series: sortBy(series, 'updatedAt').reverse(),
                    //         });
                    //     }, (e) => console.error(e)
                    // );
                    userDbRef.collection('watchedMovies').onSnapshot(
                        (snapshot) => {
                            const movies = [];
                            snapshot.forEach((doc) => movies.push(doc.data()));
                            commit('setWatched', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('userData').onSnapshot(
                        (snapshot) => {
                            const userDataItems = {};
                            snapshot.forEach((doc) => (userDataItems[doc.id] = doc.data()));
                            commit(
                                'setRecentVisits',
                                sortBy(userDataItems['recentVisits'] || [], 'updatedAt').reverse(),
                            );
                            commit('setAllLoaded', true);
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('continueWatching').onSnapshot(
                        (snapshot) => {
                            const items = [];
                            snapshot.forEach((doc) => items.push(doc.data()));
                            commit('setContinueWatching', sortBy(items, 'updatedAt').reverse());
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('friends').onSnapshot(
                        (snapshot) => {
                            const friends = [];
                            snapshot.forEach((doc) => friends.push(doc.data()));
                            commit('setFriends', friends);
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('moviesWatchList').onSnapshot(
                        (snapshot) => {
                            const movies = [];
                            snapshot.forEach((doc) => movies.push(doc.data()));
                            commit('setWatchList', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('savedFilters').onSnapshot(
                        (snapshot) => {
                            const savedFilters = [];
                            snapshot.forEach((doc) =>
                                savedFilters.push({
                                    ...doc.data(),
                                    name: doc.id,
                                }),
                            );
                            commit('setSavedFilters', savedFilters);
                        },
                        (e) => console.error(e),
                    );
                    userDbRef.collection('seriesWatchList').onSnapshot(
                        (snapshot) => {
                            const series = [];
                            snapshot.forEach((doc) => series.push(doc.data()));
                            series.forEach((series) => {
                                if (
                                    moment({ hours: 0 }).diff(series.updatedAt, 'days') * -1 >= 2 ||
                                    (moment({ hours: 0 }).diff(series.updatedAt, 'days') >= 2 &&
                                        series.status !== 'Ended')
                                ) {
                                    api.getTvDetails(parseInt(series.id)).then((details) => {
                                        const historyDocToAdd = {
                                            ...omit(details, HISTORY_OMIT_VALUES),
                                            updatedAt: Date.now(),
                                        };
                                        userDbRef
                                            .collection('seriesWatchList')
                                            .doc(`${details.id}`)
                                            .set(historyDocToAdd);
                                    });
                                }
                            });
                            commit('setWatchList', {
                                series: sortBy(series, 'updatedAt').reverse(),
                            });
                        },
                        (e) => console.error(e),
                    );
                } else {
                    commit('setUser', {});
                    commit('setHistory', {
                        movies: [],
                        series: [],
                    });
                    commit('setWatched', {
                        movies: [],
                        series: [],
                    });
                    commit('setWatchList', []);
                }
            });
        },
        updateSideBarFilters({ commit }, { movieGenres, seriesGenres }) {
            commit('setSideBarFilters', { movieGenres, seriesGenres });
        },
    },
});

export { store };
