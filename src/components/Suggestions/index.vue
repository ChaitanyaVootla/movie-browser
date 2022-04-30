<template>
    <div class="mb-5 pt-3">
        <div class="ml-4 pl-3">
            <router-link
                v-for="savedFilter in savedFilters"
                :key="savedFilter.name"
                class="mr-3"
                :to="{
                    name: 'discover',
                    query: {
                        ...savedFilter,
                        isMovies: true,
                    },
                }"
            >
                <el-button type="primary">
                    <font-awesome-icon :icon="['fas', 'star']" class="mr-2" />
                    {{ savedFilter.name }}
                </el-button>
            </router-link>
        </div>
        <mb-slider
            :items="recommendedMoviesByPopularity"
            :configuration="configuration"
            :heading="'Suggestions - Trending'"
            :id="'suggestedMoviesPopular'"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
            v-if="recommendedMoviesByPopularity.length"
        ></mb-slider>
        <mb-slider
            :items="randomFavoriteGenreMovies"
            :configuration="configuration"
            :heading="randomFavoriteGenre.name + ' Movies'"
            :id="'randomFavoriteGenreMovies'"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
            v-if="randomFavoriteGenre.name && randomFavoriteGenreMovies.length"
        ></mb-slider>
        <!-- <mb-slider :items="recommendedMoviesAllTime" :configuration="configuration"
            :heading="'Suggestions - All Time'" :id="'suggestedMoviesAllTime'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
            v-if="recommendedMoviesAllTime.length"></mb-slider> -->
        <mb-slider
            :items="moviesSimilarToRecent"
            :configuration="configuration"
            :heading="'Because you watched - ' + randomRecentWatchedMovie.original_title"
            :id="'moviesSimilarToRecent'"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
            v-if="randomRecentWatchedMovie.original_title && moviesSimilarToRecent.length"
        ></mb-slider>
    </div>
</template>

<script lang="ts">
import { api } from '../../API/api';
import { sortBy, groupBy, keyBy, uniqBy, random } from 'lodash';

export default {
    name: 'suggestions',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            trendingListWeek: [],
            currentCarouselItem: {} as any,
            historyLength: 4,
            popularMovies: [],
            trendingMovies: [],
            moviesSimilarToRecent: [],
            randomFavoriteGenreMovies: [],
            randomRecentMovieLimit: 10,
            randomRecentWatchedMovieObj: {},
            randomFavoriteGenresLimit: 4,
        };
    },
    mounted() {
        this.loadData();
    },
    computed: {
        savedFilters() {
            return this.$store.getters.savedFilters;
        },
        favoriteGenres() {
            const history = this.$store.getters.history.movies;
            const genresArrayList = history.map((movie) => movie.genres);
            return this.getSortedObjects(genresArrayList);
        },
        favoriteKeywords() {
            const history = this.$store.getters.history.movies;
            const keywordsArrayList = history.map((movie) => movie.keywords.keywords);
            return this.getSortedObjects(keywordsArrayList);
        },
        recommendedMoviesByPopularity() {
            const watchedMovieIds = this.$store.getters.watched.movieIds;
            return this.rateMovies(this.trendingMovies, {}).filter(({ id }) => !watchedMovieIds.includes(id));
        },
        recommendedMoviesAllTime() {
            const watchedMovieIds = this.$store.getters.watched.movieIds;
            return this.rateMovies(this.popularMovies, { ignorePopularity: true }).filter(
                ({ id }) => !watchedMovieIds.includes(id),
            );
        },
        randomRecentWatchedMovie() {
            const watchedMovies = this.$store.getters.watched.movies;
            if (watchedMovies.length > this.randomRecentMovieLimit) {
                this.randomRecentWatchedMovieObj = watchedMovies[random(this.randomRecentMovieLimit - 1)];
            } else {
                this.randomRecentWatchedMovieObj = watchedMovies[random(watchedMovies.length)];
            }
            this.fetchRandomRecentMovieData();
            return this.randomRecentWatchedMovieObj || {};
        },
        randomFavoriteGenre() {
            let randomFavoriteGenre;
            const favoriteGenres = this.favoriteGenres;
            if (favoriteGenres.length > this.randomFavoriteGenresLimit) {
                randomFavoriteGenre = favoriteGenres[random(this.randomFavoriteGenresLimit - 1)];
            } else {
                randomFavoriteGenre = favoriteGenres[random(favoriteGenres.length)];
            }
            setTimeout(() => {
                this.fetchRandomFavoriteGenreMovies();
            }, 300);
            return randomFavoriteGenre;
        },
    },
    methods: {
        async fetchRandomRecentMovieData() {
            if (this.randomRecentWatchedMovieObj && this.randomRecentWatchedMovieObj.id) {
                const movieDetails = await api.getMovieDetails(this.randomRecentWatchedMovieObj.id);
                this.moviesSimilarToRecent = movieDetails.recommendations.results;
            }
        },
        async fetchRandomFavoriteGenreMovies() {
            if (this.randomFavoriteGenre && this.randomFavoriteGenre.id) {
                const data = await api.getDiscoverMoviesFull(`&with_genres=${this.randomFavoriteGenre.id}`);
                this.randomFavoriteGenreMovies = data.results;
            }
        },
        getSortedObjects(arrayList) {
            let keywords = [];
            arrayList.forEach((array) => {
                keywords = keywords.concat(array);
            });
            const grouped = groupBy(keywords, 'name');
            const keywordsByName = keyBy(keywords, 'name');
            const names = Object.keys(grouped);
            const sortedNames = sortBy(names, [(name) => grouped[name].length]).reverse();
            return sortedNames.map((name) => ({
                name,
                id: keywordsByName[name].id,
                priority: grouped[name].length,
            }));
        },
        rateMovies(moviePool, { ignorePopularity }) {
            moviePool.forEach((movie) => {
                let genreWeight = 0;
                let genreIds = [];
                if (movie.genre_ids) {
                    genreIds = movie.genre_ids;
                }
                if (movie.genres) {
                    genreIds = movie.genres.map(({ id }) => id);
                }
                genreIds.forEach((genreId) => {
                    const genre = this.favoriteGenres.find((genre) => genre.id === genreId);
                    if (genre) {
                        genreWeight += genre.priority * 10;
                    }
                });
                const ratingWeight = movie.vote_average * 100;
                movie.favoriteScore = (ignorePopularity ? 0 : movie.popularity) + genreWeight + ratingWeight;
                movie.scoreBreakdown = `${ignorePopularity ? 0 : movie.popularity} - ${genreWeight} - ${ratingWeight}`;
            });
            let sortedFavorites = sortBy(moviePool, ['favoriteScore']).reverse();
            // sortedFavorites = sortedFavorites.filter(({vote_average}) => vote_average >= 6.5);
            // console.log(sortedFavorites.map(movie => ({name: movie.title, favoriteScore: movie.favoriteScore,
            //     scoreBreakdown: movie.scoreBreakdown})))
            return uniqBy(sortedFavorites, 'id');
        },
        async getTrendingMovies() {
            const res = await api.getTrendingMovies();
            this.trendingMovies = res.results;
        },
        async loadData() {
            await this.getTrendingMovies();
            const apiData = await api.getDiscoverMoviesFull('');
            this.popularMovies = apiData.results;
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
</style>
