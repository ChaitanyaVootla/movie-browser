<template>
    <div v-if="watchedMovies.length">
        <component v-for="(data, index) in randomSuggestionsArray" :key="`randomListId-${index}`" :is="'movieSlider'"
            :movies="data.items" :configuration="configuration" class="mt-4"
            :heading="`Because you saw ${data.parentItem.title}`" :id="`randomListId-${index}`"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></component>
    </div>
</template>
<script lang="ts">
    import { api } from '../../API/api';
    import { sortBy, groupBy, keyBy, uniqBy, random, throttle } from 'lodash';

    export default {
        name: 'randomSuggestions',
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
                randomRecentMovieLimit: 30,
                randomSuggestionsArray: [],
                watchedMoviesPool: [],
                watchedMoviesTriggered: false,
                throttledLoadMore: null,
            }
        },
        mounted() {
            this.throttledLoadMore = throttle(() => {
                if (this.watchedMoviesPool.length) {
                    this.fetchRandomWatchedMovies();
                }
            }, 300)
        },
        computed: {
            watchedMovies() {
                if (!this.watchedMoviesTriggered && this.$store.getters.watched.movies.length) {
                    this.watchedMoviesTriggered = true;
                    this.watchedMoviesPool = this.$store.getters.watched.movies;
                    this.fetchRandomWatchedMovies();
                }
                return this.$store.getters.watched.movies;
            },
        },
        created() {
            window.addEventListener('scroll', this.scrollHandler);
        },
        beforeDestroy() {
            window.removeEventListener('scroll', this.scrollHandler);
        },
        methods: {
            scrollHandler() {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
                    this.throttledLoadMore();
                }
            },
            fetchRandomWatchedMovies() {
                this.getRandomRecentWatchedMovieData().then(
                    randomData => {
                        this.randomSuggestionsArray.push({
                            type: 'watchHistory',
                            ...randomData,
                        });
                    }
                );
            },
            async getRandomRecentWatchedMovieData() {
                const watchedMovies = this.$store.getters.watched.movies;
                let randomRecentWatchedMovieObj;
                if (watchedMovies.length > this.randomRecentMovieLimit) {
                    randomRecentWatchedMovieObj = this.watchedMoviesPool[random(this.randomRecentMovieLimit - 1)];
                } else {
                    randomRecentWatchedMovieObj = this.watchedMoviesPool[random(this.watchedMoviesPool.length)];
                }
                randomRecentWatchedMovieObj = this.watchedMoviesPool[random(this.watchedMoviesPool.length)];
                this.watchedMoviesPool = this.watchedMoviesPool.filter(
                    movie => {
                        return movie.id !== randomRecentWatchedMovieObj.id;
                    }
                )
                const movieDetails = await api.getMovieDetails(randomRecentWatchedMovieObj.id);
                return {
                    items: movieDetails.recommendations.results,
                    parentItem: movieDetails,
                };
            }
        }
    }
</script>
<style lang="less" scoped>

</style>
