<template>
    <div>
        <!-- Trending lists -->
        <div v-if="isTrendingDataLoaded">
            <movie-slider :movies="trendingMovies" :configuration="configuration" :heading="'Trending Movies'" :id="'trendingMovies'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
            <movie-slider :movies="latestMovies" :configuration="configuration" :heading="'Latest Movies'" :id="'latestMovies'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
            <movie-slider :movies="trendingTv" :configuration="configuration" :heading="'Trending TV Series'" :id="'trendingSeries'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
        </div>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import _ from 'lodash';
    export default {
        name: 'trending',
        props: ['configuration', 'showMovieInfo', 'showFullMovieInfo'],
        data() {
          return {
              isTrendingDataLoaded: false,
              trendingTv: [],
              trendingMovies: [],
              trendingPeople: [],
              latestMovies: [],
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
                let latestMovies: any = [];
                for (let count = 1; count < 2; count++) {
                    const pageQuery = `&page=${count}`;
                    const res = await api.getLatestMovies(pageQuery);
                    latestMovies = latestMovies.concat(res.results);
                }
                this.latestMovies = _.sortBy(latestMovies, ({popularity}) => -popularity);
                // this.latestMovies = latestMovies;
            },
        }
    }
</script>

<style scoped>
</style>
