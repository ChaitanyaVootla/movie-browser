<template>
    <div>
        <movie-slider :movies="recommendedMoviesByPopularity" :configuration="configuration"
            :heading="'Suggestions - Trending'" :id="'suggestedMoviesPopular'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
            v-if="recommendedMoviesByPopularity.length"
            :history="true"></movie-slider>
        <movie-slider :movies="recommendedMoviesAllTime" :configuration="configuration"
            :heading="'Suggestions - All Time'" :id="'suggestedMoviesAllTime'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
            v-if="recommendedMoviesAllTime.length"
            :history="true"></movie-slider>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { sortBy, groupBy, keyBy, uniqBy } from 'lodash';

    export default {
        name: 'trendingCarousel',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
        ],
        data() {
            return {
                trendingListWeek: [],
                currentCarouselItem: {} as any,
                historyLength: 4,
                popularMovies: [],
                trendingMovies: [],
            }
        },
        mounted() {
            this.loadData();
        },
        computed: {
            favoriteGenres() {
                const history = this.$store.getters.history.movies;
                const genresArrayList = history.map(movie => movie.genres);
                return this.getSortedObjects(genresArrayList);
            },
            favoriteKeywords() {
                const history = this.$store.getters.history.movies;
                const keywordsArrayList = history.map(movie => movie.keywords.keywords);
                return this.getSortedObjects(keywordsArrayList);
            },
            recommendedMoviesByPopularity() {
                return this.rateMovies(this.trendingMovies, {});
            },
            recommendedMoviesAllTime() {
                return this.rateMovies(this.popularMovies, {ignorePopularity: true});
            }
        },
        methods: {
            getSortedObjects(arrayList) {
                let keywords = [];
                arrayList.forEach(
                    array => {
                        keywords = keywords.concat(array);
                    }
                );
                const grouped = groupBy(keywords, 'name');
                const keywordsByName = keyBy(keywords, 'name');
                const names = Object.keys(grouped);
                const sortedNames = sortBy(names, [
                    (name) => grouped[name].length
                ]).reverse();
                return sortedNames.map(name => ({
                    name,
                    id: keywordsByName[name].id,
                    priority: grouped[name].length
                }));
            },
            rateMovies(moviePool, { ignorePopularity }) {
                moviePool.forEach(
                    movie => {
                        let genreWeight = 0;
                        let genreIds = [];
                        if (movie.genre_ids) {
                            genreIds = movie.genre_ids;
                        }
                        if (movie.genres) {
                            genreIds = movie.genres.map(({id}) => id);
                        }
                        genreIds.forEach(
                            genreId => {
                                const genre = this.favoriteGenres.find(genre => genre.id === genreId);
                                if (genre) {
                                    genreWeight += genre.priority*10;
                                }
                            }
                        );
                        const ratingWeight = movie.vote_average*100;
                        movie.favoriteScore = (ignorePopularity?0:movie.popularity) + genreWeight + ratingWeight;
                        movie.scoreBreakdown = `${(ignorePopularity?0:movie.popularity)} - ${genreWeight} - ${ratingWeight}`;
                    }
                );
                let sortedFavorites = sortBy(moviePool, ['favoriteScore']).reverse();
                // sortedFavorites = sortedFavorites.filter(({vote_average}) => vote_average >= 6.5);
                console.log(sortedFavorites.map(movie => ({name: movie.title, favoriteScore: movie.favoriteScore,
                    scoreBreakdown: movie.scoreBreakdown})))
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
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
</style>
