import Vue from 'vue';
import Vuex from 'vuex';
import { onAuthStateChanged, auth, db } from '../Common/firebase';
import { sortBy, omit, random } from 'lodash';
import moment from 'moment';
import { collection, doc, setDoc, onSnapshot, writeBatch } from "firebase/firestore";
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
        initFirebase({ commit }) {
            onAuthStateChanged(auth, async (user: any) => {
                if (user) {
                    if (user.email === 'speedblaze@gmail.com') {
                        user.isAdmin = true;
                    }
                    commit('setUser', user);
                    const userDbRef = doc(db, "users", user.uid);
                    const usersRef = collection(db, "users");
                    setDoc(userDbRef, {
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        email: user.email,
                        lastLoggedIn: moment().format(),
                        metadata: {...user.metadata},
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

                    onSnapshot(collection(userDbRef, 'watchedMovies'),
                        (snapshot) => {
                            const movies = [];
                            snapshot.forEach((doc) => movies.push(doc.data()));
                            commit('setWatched', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        },
                        (e) => console.error(e),
                    );

                    onSnapshot(collection(userDbRef, 'userData'),
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

                    onSnapshot(collection(userDbRef, 'continueWatching'),
                        (snapshot) => {
                            const items = [];
                            snapshot.forEach((doc) => items.push(doc.data()));
                            commit('setContinueWatching', sortBy(items, 'updatedAt').reverse().slice(0, 10));
                        },
                        (e) => console.error(e),
                    );

                    onSnapshot(collection(userDbRef, 'friends'),
                        (snapshot) => {
                            const friends = [];
                            snapshot.forEach((doc) => friends.push(doc.data()));
                            commit('setFriends', friends);
                        },
                        (e) => console.error(e),
                    );

                    onSnapshot(collection(userDbRef, 'moviesWatchList'),
                        (snapshot) => {
                            const movies = [];
                            snapshot.forEach((doc) => movies.push(doc.data()));
                            commit('setWatchList', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        },
                        (e) => console.error(e),
                    );

                    onSnapshot(collection(userDbRef, 'savedFilters'),
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

                    onSnapshot(collection(userDbRef, 'seriesWatchList'),
                        async (snapshot) => {
                            const Allseries = [];
                            snapshot.forEach((doc) => Allseries.push(doc.data()));
                            const batch = writeBatch(db);
                            for (const series of Allseries) {
                                if (
                                    (moment.duration(moment().diff(new Date(series.updatedAt))).asDays() >= 2) &&
                                    series.status !== 'Ended'
                                ) {
                                    let details:any = {};
                                    if (series?.id) {
                                        details = await api.getTvDetails(parseInt(series.id))
                                    }

                                    const historyDocToAdd = {
                                        ...omit(details, HISTORY_OMIT_VALUES),
                                        updatedAt: Date.now(),
                                    };
                                    batch.set(doc(db, `users/${user.uid}/seriesWatchList/${details.id}`), historyDocToAdd);
                                }
                            };
                            await batch.commit();
                            commit('setWatchList', {
                                series: sortBy(Allseries, 'updatedAt').reverse(),
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
