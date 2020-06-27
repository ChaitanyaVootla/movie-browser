<template>
    <div>
        <trending-carousel :configuration="configuration" :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo" :showSeriesInfo="showSeriesInfo" :movieGenres="movieGenres"
            :seriesGenres="seriesGenres"></trending-carousel>
        <div class="pt-2">
            <div v-if="isTrendingDataLoaded" class="trending-sliders-container">
                <movie-slider :movies="trendingMovies" :configuration="configuration" :heading="'Trending Movies'" :id="'trendingMovies'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
                <movie-slider :movies="latestMovies" :configuration="configuration" :heading="'Latest Movies'" :id="'latestMovies'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
                <movie-slider :movies="trendingTv" :configuration="configuration" :heading="'Trending TV Series'" :id="'trendingSeries'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></movie-slider>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import _ from 'lodash';
    export default {
        name: 'trending',
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
              isTrendingDataLoaded: false,
              trendingTv: [],
              trendingMovies: [],
              trendingPeople: [],
              latestMovies: [] as any[],
          }  
        },
        mounted() {
            this.loadData();
        },
        methods: {
            async loadData() {
                await this.getTrendingTv();
                await this.getTrendingMovies();
                await this.getLatestMovies();
                this.isTrendingDataLoaded = true;
            },
            async getTrendingTv() {
                const res = await api.getTrendingTv();
                this.trendingTv = res.results;
            },
            async getTrendingMovies() {
                const res = await api.getTrendingMovies();
                this.trendingMovies = res.results;
            },
            async getLatestMovies() {
                let {results: latestMovies} = await api.getLatestMovies();
                this.latestMovies = _.sortBy(latestMovies, ({popularity}) => -popularity);
            },
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';

    .justify-center {
        display:flex;
        justify-content:center;
    }
    .trending-sliders-container {
        margin: 0 1em 2em 1em;
    }
</style>
