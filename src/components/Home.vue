<template>
    <div>
        <!-- Discover -->
        <div class="discover-container">
            <el-row class="discover-row">
                <el-col :span="6" class="sort-order-container">
                    <ul class="nav nav-pills">
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'popularity'?'active':''"
                                v-on:click="setSortOrder('popularity.desc', 'popularity'); updateSortOrder('popular');">Popular</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'topRated'?'active':''"
                                v-on:click="setSortOrder('vote_average.desc', 'topRated'); updateSortOrder('topRated');">Top Rated</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="sortText === 'latest'?'active':''"
                                v-on:click="setSortOrder('release_date.desc', 'latest'); updateSortOrder('latest');">Latest</a>
                        </li>
                    </ul>
                </el-col>
                <el-col :span="2" class="left-dropdown-item" style="max-width: 8em;">
                    <div class="dropdown">
                        <button class="btn dropdown-toggle discover-dropdown btn-dark pb-2"
                            type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            {{selectedYearString?selectedYearString:'Year'}}
                        </button>
                        <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuButton">
                            <a class="dropdown-item flex-center" v-on:click="clearSelectedYear();">All</a>
                            <a class="dropdown-item pl-3 pr-3 mt-2">
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('new')">new</button>
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('2k')">2k</button>
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('90s')">90s</button>
                                </div>
                            </a>
                            <a class="dropdown-item pl-3 pr-3 mb-2">
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('80s')">80s</button>
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('70s')">70s</button>
                                    <button type="button" class="btn btn-dark" @click="selectYearRange('old')">old</button>
                                </div>
                            </a>
                            <a class="dropdown-item flex-center" v-for="year in years" :key="year" v-on:click="selectYear(year);">{{year}}</a>
                        </div>
                    </div>
                </el-col>

                <el-col :span="2" class="left-dropdown-item">
                    <div class="dropdown">
                        <button class="btn dropdown-toggle discover-dropdown btn-dark pb-2"
                            type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            {{selectedGenreNames.length?selectedGenreNames:'Genre'}}
                        </button>
                        <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuButton">
                            <a class="dropdown-item" v-on:click="clearSelectedGenre();">All</a>
                            <a class="dropdown-item" v-for="genre in sortedGenres()" :key="genre.id">
                                <div class="custom-control custom-checkbox">
                                    <input type="checkbox" class="custom-control-input" :value="genre.id" v-model="queryParams.selectedGenreMap[genre.id]"
                                        :id="`defaultCheck${genre.id}`" @change="goToDiscover(); updateGenreList();"/>
                                    <span class="custom-control-indicator"></span>
                                    <label class="custom-control-label" :for="`defaultCheck${genre.id}`">
                                        {{genre.name}}
                                    </label>
                                </div>
                            </a>
                        </div>
                    </div>
                </el-col>
                <el-col :span="8" class="flex-center">
                    <div class="app-logo" @click="gotoHome">
                        <font-awesome-icon :icon="['fas', 'film']" class="mt-1"/>
                    </div>
                </el-col>
                <el-col :span="5" class="mt-1 flex-right">
                    <!-- Search Bar -->
                    <div class="form-inline mt-2">
                        <input class="form-control search-bar text-white" type="search" placeholder="Search" aria-label="Search" id="searchInput"
                            v-model="searchText" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <button class="btn btn-dark search-button" @click="goToSearch">
                            <font-awesome-icon :icon="['fas', 'search']" />
                        </button>
                        <div class="search-dropdown discover-dropdown dropdown-menu dropdown-menu-left" aria-labelledby="dropdownMenuButton"
                            v-show="searchText.length > 0 && currentRoute.name !== 'search'">
                            <div class="search-item dropdown-item" v-if="searchResults.length === 0" style="justify-content: center;">
                                No Results
                            </div>
                            <div class="search-item" v-for="result in searchResults" :key="result.id" v-on:click="showMovieInfo(result)">
                                <img
                                    v-lazy="{
                                        src: imageBasePath + result.poster_path,
                                        error: require('../Assets/Images/error.svg'),
                                        loading: require('../Assets/Images/loader-bars.svg'),
                                    }"
                                    class="search-image">
                                <div class="search-info-container ml-3">
                                    <span>
                                        {{result.original_title}}
                                        <span class="text-muted ml-1" style="font-size: 0.9em;">
                                            {{getYear(result.release_date)}}
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
                </el-col>
                <el-col :span="3" class="type-switch-container flex-center">
                        <div class="selected-text">Series</div>

                        <el-switch class="type-switch"
                            v-model="isMovies"
                            active-color="#993030"
                            inactive-color="#000"
                            @change="typeChanged">
                        </el-switch>

                        <div class="selected-text">Movies</div>
                </el-col>

            </el-row>
        </div>

        <router-view v-if="isLoaded" class="mt-5 pt-1"
            :isLoaded="isLoaded"
            :configuration="configuration"
            :showMovieInfo="showMovieInfo"
            :discoverQuery="discoverQuery"
            :queryParams="queryParams"
            :clearDiscoveryData="clearDiscoveryData"
            :searchString="searchText"
            :isMovies="isMovies"
            :person="selectedPerson"
            :showFullMovieInfo="showFullMovieInfo"
            :selectPerson="goToPerson"
            :showSeriesInfo="showSeriesInfo"
        ></router-view>

        <!-- Info Modal -->
        <div class="modal fade bd-example-modal-xl" id="movieInfoModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <movie-info v-if="configuration.images"
                        :movie="selectedMovie"
                        :configuration="configuration"
                        :imageRes="'w500'"
                        :closeInfo="closeInfo"
                        :selectPerson="goToPerson"
                    ></movie-info>
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
                movieGenres: [] as Object[],
                seriesGenres: [] as Object[],
                selectedYearString: '',
                isLoaded: false,
                years: [] as number[],
                discoverQuery: '',
                sortText: '',
                sortOrder: '',
                queryParams: {
                    selectedYear: '',
                    minDate: '',
                    maxDate: '',
                    sortOrder: '',
                    selectedGenreMap: {} as any
                },
                searchText: '',
                searchResults: [],
                imageBasePath: '',
                selectedMovie: {},
                currentRoute: {} as Object,
                selectedGenreNames: '',
                isMovies: true,
                selectedPerson: {},
            };
        },
        created() {
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
        methods: {
            sortedGenres(): any {
                return _.sortBy(this.genres, (genre: any) => {
                    if (this.queryParams.selectedGenreMap[genre.id] === true) {
                        return 1;
                    }
                    return 2;
                });
            },
            async loadData() {
                await this.getConfiguration();
                await this.getMovieGenres();
                await this.getSeriesGenres();
                this.isLoaded = true;
            },
            async getConfiguration() {
                this.configuration = await api.getConfiguration();
                this.imageBasePath = this.configuration.images.secure_base_url + 'w500';
            },
            async getMovieGenres() {
                this.movieGenres = await api.getMovieGenres();
                this.genres = this.movieGenres;
            },
            async getSeriesGenres() {
                this.seriesGenres = await api.getSeriesGenres();
            },
            clearSelectedGenre() {
                _.each(this.queryParams.selectedGenreMap,
                    (isSelected, genreId) => {
                        this.queryParams.selectedGenreMap[genreId] = false;
                    }
                );
                this.updateGenreList();
            },
            selectYear(year: string) {
                this.selectedYearString = year;
                this.queryParams.minDate = '';
                this.queryParams.maxDate = '';
                this.queryParams.selectedYear = year;
                this.goToDiscover();
            },
            selectYearRange(range: string) {
                if (range === '80s') {
                    this.queryParams.minDate = '1980-01-01';
                    this.queryParams.maxDate = '1990-01-01';
                } else if (range === '70s') {
                    this.queryParams.minDate = '1970-01-01';
                    this.queryParams.maxDate = '1980-01-01';
                } else if (range === '90s') {
                    this.queryParams.minDate = '1990-01-01';
                    this.queryParams.maxDate = '2000-01-01';
                } else if (range === 'old') {
                    this.queryParams.minDate = '';
                    this.queryParams.maxDate = '1970-01-01';
                } else if (range === '2k') {
                    this.queryParams.minDate = '2000-01-01';
                    this.queryParams.maxDate = '2010-01-01';
                } else if (range === 'new') {
                    this.queryParams.minDate = '2010-01-01';
                    this.queryParams.maxDate = '';
                }
                this.selectedYearString = range;
                this.goToDiscover();
            },
            clearSelectedYear() {
                this.selectedYearString = '';
                this.queryParams.minDate = '';
                this.queryParams.maxDate = '';
                this.queryParams.selectedYear = '';
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
                this.goToDiscover();
            },
            updateSortOrder(sortOrder: string) {
                this.queryParams.sortOrder = sortOrder;
                this.goToDiscover();
            },
            clearDiscoveryData() {
                this.clearSelectedGenre();
                this.clearSelectedYear();
                this.setSortOrder('', '');
            },
            updateGenreList() {
                this.selectedGenreNames = '';
                _.each(this.queryParams.selectedGenreMap,
                    (isSelected, genreId) => {
                        if (isSelected) {
                            const genre: any = _.find(this.genres, {id: parseInt(genreId)});
                            if (genre) {
                                this.selectedGenreNames += genre.name;
                            }
                            this.selectedGenreNames += '  ';
                        }
                    }
                );
            },
            executeSearch: _.debounce(
                async function(this: any) {
                    if (this.searchText.length > 1) {
                        $('.search-dropdown')[0].scrollTop = 0;
                        const response = await api.searchMovies(this.searchText, 1);
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
            showFullMovieInfo(movie: any) {
                this.$router.push({
                    name: 'movieInfoFull',
                    params: {
                        name: movie.name || movie.original_title,
                        id: movie.id,
                    }
                }).catch(err => {});
            },
            showSeriesInfo(series: any) {
                this.$router.push({
                    name: 'seriesInfo',
                    params: {
                        name: series.name,
                        id: series.id,
                    }
                }).catch(err => {});
            },
            showMovieInfo(movie: any) {
                this.selectedMovie = movie;
                $('#movieInfoModal').modal('show');
            },
            closeInfo() {
                $('#movieInfoModal').modal('hide');
            },
            getYear(date: string) {
                return new Date(date).getFullYear();
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
            goToPerson(person: any) {
                this.closeInfo();
                this.selectedPerson = person;
                this.$router.push({
                    name: 'person',
                    params: {
                        name: person.name,
                        id: person.id,
                    }
                });
            },
            goToSearch() {
                if (this.searchText.length > 2) {
                    this.$router.push({
                        name: 'search'
                    }).catch(err => {});
                }
            },
            typeChanged() {
                this.clearSelectedGenre();
                if (this.isMovies) {
                    this.genres = this.movieGenres;
                } else {
                    this.genres = this.seriesGenres;
                }
                this.goToDiscover();
            }
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

<style scoped lang="less">
    @import '../Assets/Styles/main.less';

    .search-image[lazy=error] {
        background-size: 4em;
        padding: 2em;
        width: 7em;
    }
    .app-logo {
        margin-top: 0.3em;
        cursor: pointer;
        font-size: 1.8em;
        color: @main-red;
        background: #000;
        padding: 0.2em;
        border-radius: 100%;
        width: 1.6em;
        height: 1.6em;
        display: flex;
        justify-content: center;
    }
    .search-image[lazy=loading] {
        background-size: contain;
        padding: 2em;
        width: 7em;
    }
    .sort-order-container {
        max-width: 22em;
    }
    .left-dropdown-item {
        max-width: 8em;
    }
    .discover-container {
        background: #850909;
        padding-left: 1.5em;
        padding-top: 0.2em;
        font-weight: 400;
        position: fixed;
        width: 100%;
        top: 0;
        z-index: 101;
    }
    .discover-container .nav-link {
        // padding: 0.6em 1em;
        margin: 0.6em 0.3em;
        background: #850909;
        cursor: pointer;
        transition: all 300ms;
        // font-weight: 500;
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
        background: #000;
        border-color: #000;
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
    .custom-checkbox {
        cursor: pointer;
    }
    .genreDrodown .custom-control-label {
        width: 100%;
        cursor: pointer;
    }
    .btn-dark {
        background: #111;
        border-radius: 2;
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
    }
    .search-bar:focus {
        background: #000;
        border-color: #111;
    }
    .search-dropdown {
        margin-top: 0 !important;
        scroll-behavior: smooth;
        width: 30%;
        color: #fff !important;
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
    }
    .search-container {
        position: absolute;
        left: 78%;
        top: 0.2em;
        z-index: 100;
    }
    .search-image {
        height: 10em;
    }
    .type-switch-container {
        display: flex;
        justify-content: center;
        margin-top: 1em;
        z-index: 101;
    }
    .type-switch {
        margin-top: 0.2em;
        margin-left: 1em;
        margin-right: 1em;
    }
    .selected-text {
        font-weight: 500;
    }
    ::v-deep .el-switch__core::after {
        background-color: #fff !important;
    }
    .flex-center {
        display:flex;
        justify-content: center;
    }
    ::v-deep .el-tabs__item {
        font-size: 1.1em;
        color: #ccc;
    }
    ::v-deep .el-tabs__item:hover {
        color: #c01111;
    }
    ::v-deep .el-tabs__item.is-active {
        color: #c01111;
    }
    ::v-deep .el-tabs__active-bar {
        background-color: #c01111;
    }
    ::v-deep .el-tabs__nav-wrap::after {
        background-color: #333;
    }
</style>
