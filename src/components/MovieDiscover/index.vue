<template>
    <div>
        <div class="query-info text-muted">
            <div class="">
                {{queryData.total_results === 10000?`${queryData.total_results}+`:queryData.total_results}} results
            </div>
        </div>
        <div v-if="isLoaded" class="discover-movies-container">
            <movie-card v-for="movie in movies" :movie="movie" :configuration="configuration" :imageRes="'w500'"
                :onSelected="showMovieInfo" :key="movie.id"></movie-card>
        </div>
        <div class="loader-main" v-if="isDataLoading"></div>
    </div>
</template>

<script lang="ts">
    import { Component, Prop, Vue } from 'vue-property-decorator';
    import { api } from '../../API/api';
    import _ from 'lodash';

    export default {
        name: 'movieDiscover',
        props: ['configuration', 'discoverQuery', 'queryParams', 'showMovieInfo', 'clearDiscoveryData',],
        data() {
          return {
              isLoaded: false,
              isDataLoading: true,
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
                this.isDataLoading = false;
            },
            loadMoreMovies: _.debounce(async function(this: any) {
                this.isDataLoading = true;
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
    ::v-deep .movie-item {
        margin-left: 0.5em;
        margin-right: 0.5em;
        margin-bottom: 2em;
    }
    .query-info {
        padding: 1em 0 0 3em;
        font-weight: 500;
        display: flex;
    }
    .back-icon {
        color: bisque;
    }
    ::v-deep .info-container {
        padding: 0;
        width: 100%;
    }
    .modal-xl {
        max-width: 90%;
    }
    .loader-main {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 100%;
        height: 4em;
        display: flex;
        justify-content: center;
        background-repeat: no-repeat;
        background-position: 50% 50%;
    }
</style>
