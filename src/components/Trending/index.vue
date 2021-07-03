<template>
    <div>
        <trending-carousel class="trending-carousel-container" :configuration="configuration" :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo" :showSeriesInfo="showSeriesInfo" :movieGenres="movieGenres"
            :seriesGenres="seriesGenres" :trendingMovies="trendingMovies"></trending-carousel>
        <div class="pt-2">
            <div v-if="isTrendingDataLoaded" class="trending-sliders-container">
                <mb-slider :items="trendingMovies" :configuration="configuration" :heading="'Trending Movies'" :id="'trendingMovies'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></mb-slider>
                <!-- <mb-slider :items="latestMovies" :configuration="configuration" :heading="'Latest Movies'" :id="'latestMovies'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></mb-slider> -->
                <mb-slider :items="trendingTv" :configuration="configuration" :heading="'Trending Series'" :id="'trendingSeries'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></mb-slider>
                <mb-slider :items="currentAiring" :configuration="configuration" :heading="'Currently On Air'" :id="'currentAiring'"
                    :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></mb-slider>
                <!-- <random-suggestions :configuration="configuration" :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showSeriesInfo"></random-suggestions> -->
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
              currentAiring: [] as any[],
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
                await this.getCurrentAiring();
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
            async getCurrentAiring() {
                let {results: currentAiring} = await api.getCurrentStreamingSeries();
                this.currentAiring = _.sortBy(currentAiring, ({popularity}) => -popularity);
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
    @media (max-width: 767px) {
        .trending-sliders-container {
            margin: 0.5em;
        }
        .trending-carousel-container {
            margin-top: 0.5em;
            margin-left: 0.5em;
        }
    }
</style>
