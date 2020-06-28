import Vue from 'vue';
import Vuex from 'vuex';
import { firebase, db } from '../Common/firebase';
import { sortBy } from 'lodash';
Vue.use(Vuex);

const store = new Vuex.Store({
    state: {
        user: {},
        history: {
            isLoading: true,
            movies: [],
            series: [],
        },
        watched: {
            isLoading: true,
            movies: [],
            series: [],
        },
        moviesWatchList: [],
    },
    mutations: {
        setUser(state, user) {
            state.user = user;
        },
        setHistory(state, { movies, series }) {
            state.history.isLoading = false;
            if (movies) {
                state.history.movies = movies;
            }
            if (series) {
                state.history.series = series;
            }
        },
        setWatched(state, { movies, series }) {
            state.watched.isLoading = false;
            if (movies) {
                state.watched.movies = movies;
            }
            if (series) {
                state.watched.series = series;
            }
        },
        setMoviesWatchList(state, movies) {
            state.moviesWatchList = movies;
        },
    },
    actions: {
      initFirebase ({ commit }) {
        firebase.auth().onAuthStateChanged(
            async (user) => {
                if (user) {
                    commit('setUser', user);
                    const userDbRef = db.collection('users').doc(user.uid);
                    await userDbRef.set({
                        displayName: user.displayName,
                        photoURL: user.photoURL
                    });
                    userDbRef.collection('moviesHistory').onSnapshot(
                        snapshot => {
                            const movies = [];
                            snapshot.forEach(
                                doc => movies.push(doc.data())
                            );
                            commit('setHistory', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        }, (e) => console.error(e)
                    );
                    userDbRef.collection('seriesHistory').onSnapshot(
                        snapshot => {
                            const series = [];
                            snapshot.forEach(
                                doc => series.push(doc.data())
                            );
                            commit('setHistory', {
                                series: sortBy(series, 'updatedAt').reverse(),
                            });
                        }, (e) => console.error(e)
                    );
                    userDbRef.collection('watchedMovies').onSnapshot(
                        snapshot => {
                            const movies = [];
                            snapshot.forEach(
                                doc => movies.push(doc.data())
                            );
                            commit('setWatched', {
                                movies: sortBy(movies, 'updatedAt').reverse(),
                            });
                        }, (e) => console.error(e)
                    );
                    userDbRef.collection('moviesWatchList').onSnapshot(
                        snapshot => {
                            const movies = [];
                            snapshot.forEach(
                                doc => movies.push(doc.data())
                            );
                            commit('setMoviesWatchList', sortBy(movies, 'updatedAt').reverse());
                        }, (e) => console.error(e)
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
                }
            }
        );
      }
    },
    getters: {
        user: state => state.user,
        history: state => state.history,
        watched: state => state.watched,
        watchedMovieById: state => (id) => state.watched.movies.find(movie => movie.id === id),
        watchListMovieById: state => (id) => state.moviesWatchList.find(movie => movie.id === id),
        watchListMovies: state => state.moviesWatchList,
    }
});

export { store as default};
