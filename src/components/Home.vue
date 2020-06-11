<template>
    <div>
        <!-- Discover -->
        <div class="discover-container">
            <el-row class="discover-row">
                <el-col :span="8">
                    <ul class="nav nav-pills">
                        <li class="nav-item ml-4">
                            <a class="nav-link" :class="onDiscover?'active':''" @click="goToDiscover()">
                                <font-awesome-icon :icon="['fas', 'photo-video']" class="mr-2"/> Discover
                            </a>
                        </li>
                        <li class="nav-item ml-4">
                            <a class="nav-link" :class="onStreamingNow?'active':''" @click="goToStreamingNow()">
                                <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/> Streaming Now
                            </a>
                        </li>
                    </ul>
                </el-col>
                <el-col :span="8" class="flex-center">
                    <div class="app-logo" @click="gotoHome">
                        <font-awesome-icon :icon="['fas', 'film']" class="mt-1"/>
                    </div>
                </el-col>
                <el-col :span="8" class="flex-right">
                    <!-- Search Bar -->
                    <div class="form-inline mt-2 ml-5" style="width:100%;">
                        <input class="form-control search-bar text-white" type="search" placeholder="Search" aria-label="Search" id="searchInput"
                            v-model="searchText" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"/>
                        <button class="btn btn-dark search-button" @click="goToSearch">
                            <font-awesome-icon :icon="['fas', 'search']" />
                        </button>
                        <div class="search-dropdown discover-dropdown dropdown-menu dropdown-menu-left" aria-labelledby="dropdownMenuButton"
                            v-show="searchText.length > 0 && currentRoute.name !== 'search'">
                            <div class="search-item dropdown-item" v-if="searchResults.length === 0" style="justify-content: center;">
                                No Results
                            </div>
                            <search-results
                                :search-results="searchResults"
                                :get-genre-name-from-id="getGenreNameFromId"
                                :image-base-path="imageBasePath"
                            >
                            </search-results>
                        </div>
                    </div>
                </el-col>

            </el-row>
        </div>

        <router-view v-if="isLoaded" class="mt-5 pt-1"
            :isLoaded="isLoaded"
            :configuration="configuration"
            :showMovieInfo="showMovieInfo"
            :searchString="searchText"
            :person="selectedPerson"
            :showFullMovieInfo="showFullMovieInfo"
            :selectPerson="goToPerson"
            :showSeriesInfo="showSeriesInfo"
            :movieGenres="movieGenres"
            :seriesGenres="seriesGenres"
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
    import { sanitizeName } from '../Common/utils';
    import _ from 'lodash';

    export default {
        name: 'home',
        data: function () {
            return {
                configuration: {} as any,
                genres: [] as any[],
                movieGenres: [] as Object[],
                seriesGenres: [] as Object[],
                isLoaded: false,
                searchText: '',
                searchResults: [],
                imageBasePath: '',
                selectedMovie: {},
                currentRoute: {} as Object,
                selectedPerson: {},
            };
        },
        created() {
            this.loadData();
            this.currentRoute = this.$route;
        },
        mounted() {
            const searchInput = document.getElementById("searchInput");
            if (searchInput) {
                const self = this as any;
                searchInput.addEventListener("keyup", _.bind(function(event) {
                    if (event.keyCode === 13) {
                        self.goToSearch();
                    }
                }, this));
            }
        },
        computed: {
            onStreamingNow() {
                return this.$route.name === 'StreamingNow';
            },
            onDiscover() {
                return this.$route.name === 'discover';
            },
        },
        methods: {
            goToStreamingNow() {
                this.$router.push({
                    name: 'StreamingNow',
                }).catch(err => {});
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
            executeSearch: _.debounce(
                async function(this: any) {
                    if (this.searchText.length > 1) {
                        $('.search-dropdown')[0].scrollTop = 0;
                        const response = await api.searchAll(this.searchText, 1);
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
            showFullMovieInfo(movie: any) {
                if (movie.first_air_date) {
                    return this.showSeriesInfo(movie);
                }
                this.$router.push({
                    name: 'movieInfoFull',
                    params: {
                        name: sanitizeName(movie.name || movie.original_title),
                        id: movie.id,
                    }
                }).catch(err => {});
            },
            showSeriesInfo(series: any) {
                this.$router.push({
                    name: 'seriesInfo',
                    params: {
                        name: sanitizeName(series.name),
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
            gotoHome() {
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
                        name: sanitizeName(person.name),
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
        },
        watch: {
            searchText() {
                this.executeSearch();
            },
            $route(currentRoute) {
                this.currentRoute = currentRoute;
            }
        },
    }
</script>

<style scoped lang="less">
    @import '../Assets/Styles/main.less';

    .app-logo {
        margin-top: 0.2em;
        cursor: pointer;
        font-size: 1.8em;
        color: #000;
        background: @main-red;
        filter: opacity(0.95);
        padding: 0.2em;
        border-radius: 20%;
        width: 1.6em;
        height: 1.6em;
        display: flex;
        justify-content: center;
        align-content: center;
    }
    .sort-order-container {
        max-width: 24em;
    }
    .left-dropdown-item {
        max-width: 8em;
    }
    .discover-container {
        box-shadow: 0 7px 20px -5px #222;
        background: @primary-gray;
        padding-left: 1.5em;
        padding-top: 0.2em;
        font-weight: 400;
        position: fixed;
        width: 100%;
        top: 0;
        z-index: 101;
    }
    .discover-container .nav-link {
        margin: 0.6em 0.3em;
        background: #212121;
        cursor: pointer;
        transition: all 300ms;
        font-weight: 400;
    }
    .discover-container .nav-link:hover {
        background: #333;
    }
    .discover-container .nav-link.active {
        background-color: #333;
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
        padding-left: 1em;
        border-radius: 3px;
        background: #111;
        border-color: #222;
        color: #eee;
        font-weight: 400;
        border-bottom-right-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: 7px;
        border-top-left-radius: 7px;
        width: 85% !important;
        position: relative;
        text-transform: capitalize;
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
    .search-dropdown .dropdown-item {
        color: #fff !important;
    }
    .search-button {
        background: #111;
        border-color: #222;
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
    .flex-center {
        display:flex;
        justify-content: center;
    }
</style>
