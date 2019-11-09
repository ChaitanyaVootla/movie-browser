<template>
    <div>
        <!-- Trending lists -->
        <div v-if="isTrendingDataLoaded">
            <movie-slider :movies="trendingMovies" :configuration="configuration" :heading="'Trending Movies'" :id="'trendingMovies'"
                :showMovieInfoModal="showMovieInfo"></movie-slider>
            <movie-slider :movies="trendingTv" :configuration="configuration" :heading="'Trending TV Series'" :id="'trendingSeries'"
                :showMovieInfoModal="showMovieInfo"></movie-slider>
        </div>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    export default {
        name: 'trending',
        props: ['configuration', 'showMovieInfo'],
        data() {
          return {
              isTrendingDataLoaded: false,
              trendingTv: [],
              trendingMovies: [],
              trendingPeople: [],
          }  
        },
        mounted() {
            this.loadData();
        },
        methods: {
            async loadData() {
                await this.getTrendingTv();
                await this.getTrendingMovies();
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
        }
    }
</script>

<style scoped>
</style>
