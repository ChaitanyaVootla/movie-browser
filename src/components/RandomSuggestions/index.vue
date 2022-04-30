<template>
    <div v-if="watchedMovies.length">
        <div class="ml-4 pl-3 mt-5 mb-4 horBar"> <div>RECOMMENDATIONS</div><div class="horBarBg"></div> </div>
        <component
            v-for="(data, index) in randomSuggestionsArray"
            :key="`randomListId-${index}`"
            :is="'mbSlider'"
            :items="data.items"
            :configuration="configuration"
            class="mb-4"
            :id="`randomListId-${index}`"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showSeriesInfo"
        >
            <div>
                <span class="slider-heading">{{ `${data.parentItem.title}` }}</span>
                <span class="subText">similar</span>
            </div>
        </component>
    </div>
</template>
<script lang="ts">
import { api } from '../../API/api';
import { sortBy, groupBy, keyBy, uniqBy, random, throttle } from 'lodash';

export default {
    name: 'randomSuggestions',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            randomRecentMovieLimit: 30,
            randomSuggestionsArray: [],
            watchedMoviesPool: [],
            watchedMoviesTriggered: false,
            throttledLoadMore: null,
        };
    },
    mounted() {
        this.throttledLoadMore = throttle(
            () => {
                if (this.watchedMoviesPool.length) {
                    this.fetchRandomWatchedMovies();
                }
            },
            300,
            {
                leading: true,
            },
        );
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
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
                this.throttledLoadMore();
            }
        },
        fetchRandomWatchedMovies() {
            for (let count = 0; count < 3; count++) {
                this.getRandomRecentWatchedMovieData().then((randomData) => {
                    this.randomSuggestionsArray.push({
                        type: 'watchHistory',
                        ...randomData,
                    });
                });
            }
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
            this.watchedMoviesPool = this.watchedMoviesPool.filter((movie) => {
                return movie.id !== randomRecentWatchedMovieObj.id;
            });
            const movieDetails = await api.getMovieDetails(randomRecentWatchedMovieObj.id);
            return {
                items: movieDetails.recommendations.results,
                parentItem: movieDetails,
            };
        },
    },
};
</script>
<style lang="less" scoped>
.horBar {
    display: flex;
    font-weight: 500;
    font-size: 0.9em;
    color: #aaa;
}
.horBarBg {
    background-color: #333;
    margin-top: 0.7em;
    margin-left: 1em;
    margin-right: 3em;
    height: 3px;
    width: 100%;
}
.slider-heading {
    font-size: 17px;
    font-weight: 500;
    padding-left: 2.2em;
    padding-top: 1em;
    padding-bottom: 0.4em;
    margin-left: 0.5em;
}
.subText {
    margin-left: 0.5em;
    font-size: 0.95em;
    color: #aaa;
}
</style>
