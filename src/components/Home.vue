<template>
    <div>
        <nav class="navbar navbar-dark p-0">
            <div class="navbar-header">
                <a class="navbar-brand" @click="gotoHome">
                    <img v-lazy="require('../Assets/Images/movie-browser.png')" style="max-height: 2em"/>
                </a>
            </div>
        </nav>

        <!-- Discover -->
        <div class="discover-container">
            <div class="row discover-row">
                <div class="col-sm-3">
                    <ul class="nav nav-pills">
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'popularity'?'active':''"
                                v-on:click="setSortOrder('popularity.desc', 'popularity');">Popular</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'topRated'?'active':''"
                                v-on:click="setSortOrder('vote_average.desc', 'topRated');">Top Rated</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'lastest'?'active':''"
                                v-on:click="setSortOrder('release_date.desc', 'lastest');">Latest</a>
                        </li>
                    </ul>
                </div>
                <div class="col-sm-7">
                </div>

                <!-- Search Bar -->
                <div class="form-inline mt-2 search-container">
                    <input class="form-control search-bar text-white" type="search" placeholder="Search" aria-label="Search" id="searchInput"
                        v-model="searchText" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    <button class="btn btn-dark search-button" @click="goToSearch">
                        <font-awesome-icon :icon="['fas', 'search']" />
                    </button>
                    <div class="search-dropdown discover-dropdown dropdown-menu" aria-labelledby="dropdownMenuButton"
                        v-show="searchText.length > 0 && currentRoute.name !== 'search'">
                        <div class="search-item dropdown-item" v-if="searchResults.length === 0" style="justify-content: center;">
                            No Results
                        </div>
                        <div class="search-item" v-for="result in searchResults" :key="result.id" v-on:click="showMovieInfo(result)">
                            <img v-lazy="result.poster_path?imageBasePath + result.poster_path:'https://via.placeholder.com/110/000/000?'" class="search-image">
                            <div class="search-info-container ml-3">
                                <span>
                                    {{result.original_title}}
                                    <span class="text-muted ml-1" style="font-size: 0.9em;">
                                        {{result.release_date.split('-')[0]}}
                                    </span>
                                </span>
                                <div style="margin-top: -5px;">
                                    <span v-for="(genreId, index) in result.genre_ids" :key="genreId" class="text-muted ml-1" style="font-size: 0.9em;">
                                        {{getGenreNameFromId(genreId)}}{{index === result.genre_ids.length -1?'':','}}
                                    </span>
                                </div>
                                <div class="mt-2">
                                    <div class="rating-info" :style="`border-color: ${getRatingColor(result.vote_average)}; color: ${getRatingColor(result.vote_average)}`">
                                        {{result.vote_average}}
                                    </div>
                                </div>
                                <div style="max-height: 3em; overflow: hidden;" class="mt-4">
                                    {{result.overview}}
                                </div>
                            </div>
                            <hr/>
                        </div>
                    </div>
                </div>
                <div class="col-sm-1">
                    <div class="dropdown">
                        <button class="btn dropdown-toggle discover-dropdown btn-dark"
                            type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            {{selectedGenre.name && selectedGenre.name.length?selectedGenre.name:'Genre'}}
                        </button>
                        <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuButton">
                            <a class="dropdown-item" v-on:click="clearSelectedGenre();">All</a>
                            <a class="dropdown-item" v-for="genre in genres" :key="genre.id" v-on:click="selectGenre(genre);">{{genre.name}}</a>
                        </div>
                    </div>
                </div>
                <div class="col-sm-1">
                    <div class="dropdown">
                        <button class="btn dropdown-toggle discover-dropdown btn-dark"
                            type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            {{selectedYear?selectedYear:'Year'}}
                        </button>
                        <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuButton">
                            <a class="dropdown-item" v-on:click="clearSelectedYear();">All</a>
                            <a class="dropdown-item" v-for="year in years" :key="year" v-on:click="selectYear(year);">{{year}}</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <router-view v-if="isLoaded" class="mt-5"
            :isLoaded="isLoaded"
            :configuration="configuration"
            :showMovieInfo="showMovieInfo"
            :discoverQuery="discoverQuery"
            :queryParams="queryParams"
            :clearDiscoveryData="clearDiscoveryData"
            :searchString="searchText"
        ></router-view>

        <!-- Info Modal -->
        <div class="modal fade bd-example-modal-xl" id="movieInfoModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <movie-info :movie="selectedMovie" :configuration="configuration" :imageRes="'w500'"
                        :closeInfo="closeInfo" v-if="configuration.images"></movie-info>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { Component, Prop, Vue } from 'vue-property-decorator';
    import { api } from '../API/api';
    import _ from 'lodash';

    export default {
        name: 'home',
        data: function () {
            return {
                trendingTv: [],
                trendingMovies: [],
                nowPlayingMovies: [],
                configuration: {},
                genres: [] as Object[],
                selectedGenre: {},
                selectedYear: '',
                isLoaded: false,
                years: [] as number[],
                discoverQuery: '',
                sortText: '',
                sortOrder: '',
                queryParams: {
                    selectedYear: '',
                    selectedGenre: {
                        name: '',
                        id: null
                    },
                    sortOrder: ''
                },
                searchText: '',
                searchResults: [],
                imageBasePath: '',
                selectedMovie: {},
                currentRoute: {} as Object
            };
        },
        created() {
            window.addEventListener('scroll', this.onScrollEvent);
            this.setupData();
            this.loadData();
            this.currentRoute = this.$route;
        },
        mounted() {
            const searchInput = document.getElementById("searchInput");
            if (searchInput) {
                searchInput.addEventListener("keyup", _.bind(function(event) {
                    if (event.keyCode === 13) {
                        this.goToSearch();
                    }
                }, this));
            }
        },
        destroyed () {
            window.removeEventListener('scroll', this.onScrollEvent);
        },
        methods: {
            onScrollEvent() {
                if (window.scrollY > 50) {
                    $('.discover-container').css('top', 0);
                } else {
                    $('.discover-container').css('top', 65 - window.scrollY + 'px');
                }
            },
            async loadData() {
                await this.getConfiguration();
                await this.getMovieGenres();
                this.isLoaded = true;
            },
            async getConfiguration() {
                this.configuration = await api.getConfiguration();
                this.imageBasePath = this.configuration.images.secure_base_url + 'w500';
            },
            async getMovieGenres() {
                this.genres = await api.getMovieGenres();
            },
            selectGenre(genre: any) {
                this.selectedGenre = genre;
                this.queryParams.selectedGenre = genre;
                this.updateDiscoverQuery();
                this.goToDiscover();
            },
            clearSelectedGenre() {
                this.selectedGenre = {};
                this.queryParams.selectedGenre = {
                        name: '',
                        id: null
                };
                this.updateDiscoverQuery();
            },
            selectYear(year: string) {
                this.selectedYear = year;
                this.queryParams.selectedYear = year;
                this.updateDiscoverQuery();
                this.goToDiscover();
            },
            clearSelectedYear() {
                this.selectedYear = '';
                this.queryParams.selectedYear = '';
                this.updateDiscoverQuery();
            },
            setupData() {
                const currentYear = new Date().getFullYear();
                for (let i = 0; i < 150; i++) {
                    this.years.push(currentYear - i);
                }
            },
            setSortOrder(sortOrder: string, sortText: string) {
                this.queryParams.sortOrder = sortText;
                this.sortOrder = sortOrder;
                this.sortText = sortText;
                this.updateDiscoverQuery();
                this.goToDiscover();
            },
            clearDiscoveryData() {
                this.clearSelectedGenre();
                this.clearSelectedYear();
                this.setSortOrder('', '');
            },
            updateDiscoverQuery() {
                this.discoverQuery = '';
                if (this.sortOrder.length)
                    this.discoverQuery += `&sort_by=${this.sortOrder}`;
                if (this.queryParams.selectedYear)
                    this.discoverQuery += `&primary_release_year=${this.queryParams.selectedYear}`;
                if (this.queryParams.selectedGenre.name.length)
                    this.discoverQuery += `&with_genres=${this.queryParams.selectedGenre.id}`;
            },
            executeSearch: _.debounce(
                async function(this: any) {
                    if (this.searchText.length > 1) {
                        $('.search-dropdown')[0].scrollTop = 0;
                        const response = await api.searchMovies(this.searchText);
                        this.searchResults = _.sortBy(response.results, 'popularity').reverse();
                    }
                }, 200
            ),
            getGenreNameFromId(id: number) {
                const genre = _.find(this.genres, {id: id});
                if (genre) {
                    return genre.name;
                }
            },
            getRatingColor: function(rating: number) {
                if (rating < 5)
                    return 'red';
                if (rating < 6.5)
                    return 'orange';
                if (rating < 8)
                    return 'green';
                else
                    return 'purple';
            },
            showMovieInfo(movie: any) {
                this.selectedMovie = movie;
                $('#movieInfoModal').modal('show');
            },
            closeInfo() {
                $('#movieInfoModal').modal('hide');
            },
            gotoHome() {
                this.clearDiscoveryData();
                this.$router.push({
                    name: 'home'
                }).catch(err => {});
            },
            goToDiscover() {
                this.$router.push({
                    name: 'discover'
                }).catch(err => {});
            },
            goToSearch() {
                if (this.searchText.length > 2) {
                    this.$router.push({
                        name: 'search'
                    }).catch(err => {});
                }
            },
        },
        watch: {
            searchText() {
                this.executeSearch();
            },
            $route(currentRoute) {
                this.currentRoute = currentRoute;
            }
        },
        beforeRouteEnter() {
            this.clearDiscoveryData();
        }
    }
</script>

<style scoped>
    .navbar {
        background: #000;
        color: black;
    }
    .navbar-header {
        float: left;
        padding: 0.5em;
        text-align: center;
        width: 100%;
    }
    .navbar-brand {
        padding-left: 1.2em;
        font-weight: 600;
        color: #fff !important;
        float: none;
        cursor: pointer;
    }
    .discover-container {
        background: #850909;
        padding-left: 1.5em;
        font-weight: 400;
        position: fixed;
        width: 100%;
        top: 65px;
        z-index: 100;
    }
    .discover-container .nav-link {
        padding: 1em 1.5em 1em 1.5em;
        background: #850909;
        border-radius: 0;
        cursor: pointer;
        transition: all 300ms;
        font-weight: 500;
    }
    .discover-container .nav-link:hover {
        background: #222;
    }
    .discover-container .nav-link.active {
        background: #111;
        font-weight: 500;
        color: #fff;
    }
    .discover-row {
        margin: 0;
        position: relative;
    }
    .discover-dropdown {
        margin-top: 0.6em;
        background: #111;
        border-color: #111;
        color: #ccc;
    }
    .dropdown-menu {
        max-height: 20em;
        overflow: auto;
        background: #000;
        color: #ccc;
    }
    .dropdown-item {
        cursor: pointer;
    }
    .dropdown-item:hover {
        color: white !important;
        background: #222;
    }
    .rating-info {
        padding: 0.2em;
        border: 0.15em solid #ccc;
        border-radius: 100%;
        font-weight: 500;
        background: rgba(0, 0, 0, 0.2);
        width: 2.2em;
        height: 1.9em;
        text-align: center;
        vertical-align: middle;
        display: inline-table;
        padding: 0.2em;
    }
    ::v-deep .info-container {
        padding: 0  !important;
        width: 100%  !important;
    }
    .modal-xl {
        max-width: 95%;
    }
    /* Search Styles */
    .search-bar {
        border-radius: 3px;
        background: #000;
        border-color: #111;
        color: #eee;
        font-weight: 500;
        border-bottom-right-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: 7px;
        border-top-left-radius: 7px;
        width: 20em !important;
        position: relative;
        left: -50%;
    }
    .search-bar:focus {
        background: #000;
        border-color: #111;
    }
    .search-dropdown {
        margin-top: 0 !important;
        scroll-behavior: smooth;
        width: 100%;
        color: #fff !important;
        width: 150%;
        left: -33% !important;
        overflow-x: hidden !important;
        border-radius: 10px;
        max-height: 30em;
        box-shadow: 0px 30px 60px 20px rgba(0,0,0,0.95);
    }
    .search-item {
        display: flex;
        margin-bottom: 0.5em;
        padding-bottom: 0.5em;
        cursor: pointer;
        border-bottom: solid 1px #333;
    }
    .search-item:last-child {
        border-bottom: 0;
    }
    .search-item:hover {
        background: rgb(8, 8, 8);
    }
    .search-info-container {
        display: flex;
        flex-direction: column;
    }
    .search-dropdown .dropdown-item {
        color: #fff !important;
    }
    .search-button {
        background: #000;
        border-color: #111;
        color: #eee;
        font-weight: 500;
        border-bottom-left-radius: 0;
        border-top-left-radius: 0;
        border-bottom-right-radius: 7px;
        border-top-right-radius: 7px;
        position: relative;
        left: -50%;
    }
    .search-container {
        position: absolute;
        left: 50%;
    }
    .search-image {
        height: 10em;
    }
</style>
