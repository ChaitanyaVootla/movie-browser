<template>
    <div>
        <el-menu
            class="el-menu-demo"
            mode="horizontal"
            background-color="#0f0f0f"
            text-color="#eee"
            :default-active="activeNavItem"
            active-text-color="#b91d1d">
            <el-menu-item index="discover" class="ml-5" :route="{name: 'discover'}">
                <router-link :to="{ name: 'discover'}">
                    <div :class="onDiscover?'active':''" @click="goToDiscover()">
                        <font-awesome-icon :icon="['fas', 'photo-video']" class="mr-2"/> Discover
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="StreamingNow">
                <router-link :to="{ name: 'StreamingNow'}">
                    <div :class="onStreamingNow?'active':''">
                        <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/> Streaming Now
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="app-logo" class="menu-center-item menu-item-nobg">
                <router-link :to="{ name: 'home'}">
                    <div class="app-logo">
                        <font-awesome-icon :icon="['fas', 'film']"/>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="search" class="menu-center-item menu-item-nobg search-menu-item">
                <div @keydown.stop @click="searchInputclicked" class="search-intput-container">
                    <el-input placeholder="Search" v-model="searchText">
                        <el-button slot="append" icon="el-icon-search"></el-button>
                    </el-input>
                </div>
            </el-menu-item>
            <el-menu-item index="settings" class="menu-item-right menu-item-nobg mr-4">
                <el-dropdown trigger="click">
                    <div><i class="el-icon-s-tools"></i></div>
                    <el-dropdown-menu slot="dropdown">
                        <el-dropdown-item>
                            <a href="https://github.com/ChaitanyaVootla/movie-browser" target="_blank">
                                <font-awesome-icon :icon="['fab', 'github']" class="mr-1 dropdown-icon"/>
                                Github Repo
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://www.themoviedb.org/" target="_blank">
                                <font-awesome-icon :icon="['fas', 'film']" class="mr-1 dropdown-icon"/>
                                TMDB
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://developers.themoviedb.org/3" target="_blank">
                                <font-awesome-icon :icon="['fas', 'file-alt']" class="mr-1 dropdown-icon"/>
                                TMDB Docs
                            </a>
                        </el-dropdown-item>
                    </el-dropdown-menu>
                </el-dropdown>
            </el-menu-item>
        </el-menu>
        <div class="search-dropdown" v-show="searchText.length > 0 && currentRoute.name !== 'search' && showSearchResults">
            <div class="search-item dropdown-item search-no-results" v-if="searchResults.length === 0">
                No Results
            </div>
            <search-results
                :search-results="searchResults"
                :get-genre-name-from-id="getGenreNameFromId"
                :image-base-path="imageBasePath"
                :search-item-clicked="searchItemclicked">
            </search-results>
        </div>
        <router-view v-if="isLoaded" class="mt-0"
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
    import { configuration, movieGenres, seriesGenres } from '../Common/staticConfig';

    export default {
        name: 'home',
        data: function () {
            return {
                configuration,
                genres: [] as any[],
                movieGenres,
                seriesGenres,
                isLoaded: false,
                searchText: '',
                searchResults: [],
                imageBasePath: '',
                selectedMovie: {},
                currentRoute: {} as Object,
                selectedPerson: {},
                showSearchResults: true,
            };
        },
        created() {
            this.loadData();
            this.currentRoute = this.$route;
        },
        mounted() {
            const searchInput = document.getElementById("searchInput");
            const self = this as any;
            // TODO is a separate search page required?
            // if (searchInput) {
            //     searchInput.addEventListener("keyup", _.bind(function(event) {
            //         if (event.keyCode === 13) {
            //             self.goToSearch();
            //         }
            //     }, this));
            // }
            $(window).click(function() {
                self.showSearchResults = false;
            });

            $('.search-dropdown, .search-intput-container').click(function(event){
                event.stopPropagation();
            });
        },
        computed: {
            onStreamingNow() {
                return this.$route.name === 'StreamingNow';
            },
            onDiscover() {
                return this.$route.name === 'discover';
            },
            activeNavItem() {
                if (this.$route.name === 'discover') {
                    return 'discover';
                } else if (this.$route.name === 'StreamingNow') {
                    return 'StreamingNow';
                } else {
                    return 'nothing';
                }
            }
        },
        methods: {
            searchInputclicked() {
                this.showSearchResults = true;
            },
            searchItemclicked() {
                this.showSearchResults = false;
            },
            async loadData() {
                this.genres = movieGenres;
                this.imageBasePath = configuration.images.secure_base_url + 'w500';
                this.isLoaded = true;
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
                this.showSearchResults = true;
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
        // margin-top: 0.2em;
        cursor: pointer;
        font-size: 1.7em;
        color: #000;
        background: @main-red;
        filter: opacity(0.85);
        padding: 0.2em;
        width: 2.2em;
        // height: 1.6em;
        box-shadow: 0px 0px 200px 150px rgba(0, 0, 0, 0.514);
        height: 100%;
        padding-top: 0.6em;
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
        color: @text-color;
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
        position: absolute;
        top: 3.4em;
        z-index: 100;
        right: 6em;
        scroll-behavior: smooth;
        width: 30%;
        overflow-x: hidden;
        color: #fff !important;
        border-radius: 3px;
        max-height: 30em;
        box-shadow: 0px 30px 60px 20px rgba(0,0,0,0.95);
        background: #000;
        border-color: #000;
        color: #ccc;
        padding: 0.5em;
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
    .dropdown-icon {
        width: 2em;
    }
    .menu-center-item {
        left: 30%;
    }
    .menu-item-right {
        float: right !important;
    }
    .el-menu-item:hover.menu-item-nobg {
        background-color: #0f0f0f !important;
        border: 0 !important;
    }
    .el-menu-item.menu-item-nobg {
        border: 0 !important;
    }
    .search-menu-item {
        width: 30em;
        margin-left: 20em !important;
    }
    .search-no-results {
        padding: 1em;
        text-align: center;
    }
</style>
