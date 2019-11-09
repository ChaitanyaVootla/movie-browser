<template>
    <div>
        <div class="query-info text-muted">
            <div class="">
                {{queryData.total_results === 10000?`${queryData.total_results}+`:queryData.total_results}} Results
            </div>
        </div>
        <div v-if="isLoaded" class="discover-movies-container">
            <movie-card v-for="movie in movies" :movie="movie" :configuration="configuration" :imageRes="'w500'"
                :onSelected="showMovieInfo" :key="movie.id"></movie-card>
        </div>
        <!-- <div class="load-more">
            <button class="btn btn-dark mt-2 mb-5 load-more-btn" v-on:click="loadMoreMovies()">Load More</button>
        </div> -->
    </div>
</template>

<script lang="ts">
    import { Component, Prop, Vue } from 'vue-property-decorator';
    import { api } from '../../API/api';
    export default {
        props: {
            configuration: {
                type: Object,
                required: true
            },
            discoverQuery: {
                type: String,
                required: true
            },
            queryParams: {
                type: Object,
                required: true
            },
            showMovieInfo: Function,
            clearDiscoveryData: Function
        },
        data() {
          return {
              isLoaded: false,
              movies: [],
              queryData: {
                  results: []
              },
              currentPage: 1,
              selectedMovie: {}
          }  
        },
        created() {
            this.loadMovies();
            const self = this;
            window.onscroll = function() {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
                   self.loadMoreMovies();
                }
            };
        },
        methods: {
            loadMovies: async function() {
                this.queryData = await api.getDiscoverMovies(this.discoverQuery);
                this.movies = this.queryData.results;
                await this.loadMoreMovies();
                this.isLoaded = true;
            },
            fetchMoreMovies: async function() {
                this.currentPage++;
                let currentdiscoverQuery = this.discoverQuery;
                currentdiscoverQuery += `&page=${this.currentPage}`;
                const queryResult = await api.getDiscoverMovies(currentdiscoverQuery);
                this.movies = this.movies.concat(queryResult.results);
                this.isLoaded = true;
            },
            loadMoreMovies: _.debounce(async function() {
                for (let count = 1; count < 3; count++) {
                    await this.fetchMoreMovies();
                }
            }, 200),
            closeInfo() {
                $('#movieInfoModal').modal('hide');
            },
        },
        watch: {
            discoverQuery: function (newQuery, oldQuery) {
                if (newQuery.length > 1) {
                    this.currentPage = 1;
                    this.loadMovies();
                }
            }
        }
    }
</script>

<style scoped>
    .discover-movies-container {
        padding: 1em 2.5em;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
    }
    /deep/.movie-item {
        margin-left: 0.5em;
        margin-right: 0.5em;
        margin-bottom: 2em;
    }
    .load-more {
        display: flex;
        justify-content: center;
    }
    .load-more-btn {
        background: #460303;
        border-color: red;
    }
    .query-info {
        padding: 1em 0 0 3em;
        font-weight: 500;
        display: flex;
    }
    .back-icon {
        color: bisque;
    }
    /deep/.info-container {
        padding: 0;
        width: 100%;
    }
    .modal-xl {
        max-width: 90%;
    }
</style>
