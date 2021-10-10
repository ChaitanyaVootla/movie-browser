<template>
    <div class="primary-container">
        <el-menu
            class="top-navbar"
            mode="horizontal"
            background-color="#0f0f0f"
            text-color="#eee"
            :default-active="activeNavItem"
            active-text-color="#b91d1d">
            <el-menu-item index="Trending" class="first-menu-item p-0">
                <router-link :to="{ name: 'trending'}">
                    <div class="pl-4 pr-4" :class="onTrending?'active':''">
                        <font-awesome-icon :icon="['fas', 'home']" class="mr-2 trending-icon"/>
                        <span class="mobile-hide">Home</span>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="discover" class=" p-0">
                <router-link :to="{ name: 'discover'}">
                    <div class="pl-4 pr-4" :class="onDiscover?'active':''">
                        <font-awesome-icon :icon="['fas', 'photo-video']" class="mr-2"/>
                        <span class="mobile-hide">Browse</span>
                    </div>
                </router-link>
            </el-menu-item>
            <!-- <el-menu-item index="Suggestions" class=" p-0">
                <router-link :to="{ name: 'Suggestions'}">
                    <div class="pl-4 pr-4" :class="onSuggestions?'active':''">
                        <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/>
                        <span class="mobile-hide">Suggestions</span>
                    </div>
                </router-link>
            </el-menu-item> -->
            <el-menu-item index="WatchList" class=" p-0">
                <router-link :to="{ name: 'WatchList'}">
                    <div class="pl-4 pr-4" :class="onWatchList?'active':''">
                        <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/>
                        <span class="mobile-hide">Watch List</span>
                    </div>
                </router-link>
            </el-menu-item>
            <!-- <el-menu-item index="Friends" class=" p-0">
                <router-link :to="{ name: 'Friends'}">
                    <div class="pl-4 pr-4" :class="onWatchList?'active':''">
                        <font-awesome-icon :icon="['fas', 'user-friends']" class="mr-2"/>
                        <span class="mobile-hide">Friends</span>
                    </div>
                </router-link>
            </el-menu-item> -->
            <!-- <el-menu-item index="Content" class=" p-0">
                <router-link :to="{ name: 'Content'}">
                    <div class="pl-4 pr-4" :class="onContent?'active':''">
                        <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/>
                        <span class="mobile-hide">Content</span>
                    </div>
                </router-link>
            </el-menu-item> -->
            <!-- <el-menu-item index="Interests" class=" p-0">
                <router-link :to="{ name: 'Interests'}">
                    <div class="pl-4 pr-4" :class="onInterests?'active':''">
                        <font-awesome-icon :icon="['fas', 'eye']" class="mr-2"/>
                        <span class="mobile-hide">Interests</span>
                    </div>
                </router-link>
            </el-menu-item> -->
            <!-- <el-menu-item index="StreamingNow" class=" p-0">
                <router-link :to="{ name: 'StreamingNow'}">
                    <div class="pl-4 pr-4" :class="onStreamingNow?'active':''">
                        <font-awesome-icon :icon="['fas', 'stream']" class="mr-2"/>
                        <span class="mobile-hide">Streaming Now</span>
                    </div>
                </router-link>
            </el-menu-item> -->
            <el-menu-item index="app-logo" class="menu-center-item menu-item-nobg mobile-hide" aria-label="Home" @click="logoClicked">
                <router-link :to="{ name: 'home'}"
                    title="home">
                    <div class="app-logo">
                        <font-awesome-icon :icon="['fas', 'film']"/>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="search" class="menu-item-nobg search-menu-item mobile-hide">
                <div>
                    <div @keydown.stop @click="searchInputclicked" class="search-intput-container">
                        <el-input placeholder="Search" v-model="searchText">
                            <!-- <el-button slot="append" icon="el-icon-search"></el-button> -->
                        </el-input>
                    </div>
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
                </div>
            </el-menu-item>
            <el-menu-item class="menu-item-right menu-item-nobg mr-4 user-menu-item mobile-hide" aria-label="Settings">
                <div @click="signInClicked" v-if="!user.photoURL" class="mt-1 mobile-hide">
                    Sign in
                </div>
                <div @click="signInClicked" v-if="!user.photoURL" class="desk-hide">
                    <font-awesome-icon :icon="['fas', 'user']"/>
                </div>
                <div v-else>
                    <el-dropdown trigger="click" aria-label="Settings">
                        <img :src="user.photoURL" class="user-photo"/>
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item>
                                <router-link :to="{name: 'Interests'}">
                                    <font-awesome-icon :icon="['fas', 'user']" class="mr-1"/>
                                    Profile
                                </router-link>
                            </el-dropdown-item>
                            <el-dropdown-item  divided>
                                <a href="https://github.com/ChaitanyaVootla/movie-browser" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fab', 'github']" class="mr-1"/>
                                    Github Repo
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fas', 'film']" class="mr-1"/>
                                    TMDB
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fas', 'file-alt']" class="mr-1"/>
                                    TMDB Docs
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item  divided>
                                <div @click="signOutClicked">
                                    <font-awesome-icon :icon="['fas', 'sign-out-alt']" class="mr-1"/>
                                    Sign out
                                </div>
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </div>
            </el-menu-item>
            <el-menu-item v-if="!user.photoURL" index="settings" class="menu-item-right menu-item-nobg p-0 mobile-hide">
                <el-dropdown trigger="click">
                    <div><i class="el-icon-s-tools" aria-label="Settings"></i></div>
                    <el-dropdown-menu slot="dropdown">
                        <el-dropdown-item>
                            <a href="https://github.com/ChaitanyaVootla/movie-browser" rel="noopener" target="_blank">
                                <font-awesome-icon :icon="['fab', 'github']" class="mr-1"/>
                                Github Repo
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                <font-awesome-icon :icon="['fas', 'film']" class="mr-1"/>
                                TMDB
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                <font-awesome-icon :icon="['fas', 'file-alt']" class="mr-1"/>
                                TMDB Docs
                            </a>
                        </el-dropdown-item>
                    </el-dropdown-menu>
                </el-dropdown>
            </el-menu-item>
        </el-menu>
        <el-menu class="desk-hide" :default-active="activeNavItem" mode="horizontal">
            <el-menu-item index="search" class="menu-item-nobg search-menu-item">
                <div>
                    <div @keydown.stop @click="searchInputclicked" class="search-intput-container">
                        <el-input placeholder="Search" v-model="searchText">
                            <!-- <el-button slot="append" icon="el-icon-search"></el-button> -->
                        </el-input>
                    </div>
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
                </div>
            </el-menu-item>
            <el-menu-item class="menu-item-right menu-item-nobg ml-2 user-menu-item" aria-label="Settings">
                <div @click="signInClicked" v-if="!user.photoURL" class="mt-1 mobile-hide">
                    Sign in
                </div>
                <div @click="signInClicked" v-if="!user.photoURL" class="desk-hide">
                    <font-awesome-icon :icon="['fas', 'user']"/>
                </div>
                <div v-else>
                    <el-dropdown trigger="click" aria-label="Settings">
                        <img :src="user.photoURL" class="user-photo"/>
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item>
                                <router-link :to="{name: 'Interests'}">
                                    <font-awesome-icon :icon="['fas', 'user']" class="mr-1"/>
                                    Profile
                                </router-link>
                            </el-dropdown-item>
                            <el-dropdown-item  divided>
                                <a href="https://github.com/ChaitanyaVootla/movie-browser" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fab', 'github']" class="mr-1"/>
                                    Github Repo
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fas', 'film']" class="mr-1"/>
                                    TMDB
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                    <font-awesome-icon :icon="['fas', 'file-alt']" class="mr-1"/>
                                    TMDB Docs
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item  divided>
                                <div @click="signOutClicked">
                                    <font-awesome-icon :icon="['fas', 'sign-out-alt']" class="mr-1"/>
                                    Sign out
                                </div>
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </div>
            </el-menu-item>
        </el-menu>
        <transition name="view">
            <router-view v-if="isLoaded" class="main-router"
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
        </transition>

        <!-- Side Drawer -->
        <!-- <div class="drawer-button" @click="$refs.sideDrawer.openDrawer()">
            <font-awesome-icon :icon="['fas', 'filter']"/>
        </div>
        <side-drawer ref="sideDrawer"
            :movieGenres="movieGenres"
            :seriesGenres="seriesGenres">
        </side-drawer> -->

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
    import { api } from '../API/api';
    import { sanitizeName } from '../Common/utils';
    import _ from 'lodash';
    import { configuration, movieGenres, seriesGenres } from '../Common/staticConfig';
    import { signIn, firebase, signOut, db } from '../Common/firebase';
    import anime from 'animejs';

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
                showDrawer: false,
                logoAnimation: null,
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
            this.logoAnimation = anime({
                targets: '.app-logo',
                rotate: ['', '180', ''],
                borderRadius: ['0%', '50%', '0%'],
                backgroundColor: ['#850909', '#fff', '#8f0b0b'],
                easing: 'easeInOutQuad',
                autoplay: false,
                duration: 500,
            });
        },
        computed: {
            user() {
                return this.$store.getters.user;
            },
            onStreamingNow() {
                return this.$route.name === 'StreamingNow';
            },
            onWatchList() {
                return this.$route.name === 'WatchList';
            },
            onFriends() {
                return this.$route.name === 'Friends';
            },
            onContent() {
                return this.$route.name === 'Content';
            },
            onSuggestions() {
                return this.$route.name === 'Suggestions';
            },
            onInterests() {
                return this.$route.name === 'Interests';
            },
            onDiscover() {
                return this.$route.name === 'discover';
            },
            onTrending() {
                return this.$route.name === 'trending';
            },
            activeNavItem() {
                if (this.$route.name === 'discover') {
                    return 'discover';
                } else if (this.$route.name === 'WatchList') {
                    return 'WatchList';
                } else if (this.$route.name === 'StreamingNow') {
                    return 'StreamingNow';
                } else if (this.$route.name === 'Interests') {
                    return 'Interests';
                } else if (this.$route.name === 'trending') {
                    return 'Trending';
                } else if (this.$route.name === 'Suggestions') {
                    return 'Suggestions';
                } else {
                    return 'nothing';
                }
            }
        },
        methods: {
            logoClicked() {
                this.logoAnimation.play();
            },
            signInClicked() {
                signIn();
            },
            signOutClicked() {
                signOut();
            },
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
            executeSearch: _.throttle(
                async function(this: any) {
                    if (this.searchText.length > 1) {
                        $('.search-dropdown')[0].scrollTop = 0;
                        const response = await api.searchAll(this.searchText + '', 1);
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
        height: 100%;
        padding-top: 0.6em;
        display: flex;
        justify-content: center;
        align-content: center;
    }
    .drawer-button {
        position: fixed;
        right: 0;
        top: 50%;
        padding: 2em 0.5em;
        background: @main-red;
        border-top-left-radius: 1em;
        border-bottom-left-radius: 1em;
        border-top-right-radius: 0em;
        border-bottom-right-radius: 0em;
        z-index: 1000000;
        cursor: pointer;
    }
    .trending-icon{
        font-size: 1.2em;
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
        color: @text-color;
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
        color: @text-color !important;
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
        scroll-behavior: smooth;
        width: 100%;
        overflow-x: hidden;
        color: @text-color !important;
        border-radius: 3px;
        max-height: 30em;
        box-shadow: 0px 30px 60px 20px rgba(0,0,0,0.95);
        background: #000;
        border-color: #000;
        color: #ccc;
        padding: 0.5em;
    }
    .search-intput-container {
        position: absolute;
        width: 100%;
    }
    .search-dropdown .dropdown-item {
        color: @text-color !important;
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
        left: calc(50% - 2.5em);
        position: absolute;
    }
    .menu-item-right {
        float: right !important;
    }
    .el-menu-item {
        color: @text-color !important;
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
        margin-left: 17em !important;
        right: 12em;
        position: absolute;
    }
    .search-no-results {
        padding: 1em;
        text-align: center;
    }
    .user-photo {
        height: 2em;
        width: auto;
        border-radius: 100%;
    }
    .user-menu-item {
        width: 5em;
    }
    .top-navbar {
        box-shadow: 0px -6px 10px 7px rgba(148, 148, 148, 0.1);
        position: fixed;
        width: 100%;
        z-index: 100;
        top: 0;
    }
    .main-router {
        margin-top: 3.5em;
    }
    .primary-container {
        position: relative;
    }
    .first-menu-item {
        margin-left: 3rem !important;
    }
    .view-enter-active, .view.leave-active {
        transition: opacity 0.2s ease-in-out, transform 0.2s ease;
        animation: bounce-in .4s;
    }
    .view-enter-active {
        transition-delay: 0.1s;
    }
    @keyframes bounce-in {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1);
        }
        100% {
            transform: scale(1);
        }
    }
    .view-enter {
        opacity: 0;
        // transform: translateY(-50px);
    }
    .view-enter-to {
        opacity: 1;
        // transform: translateY(0px);
    }
    .view-leave {
        opacity: 1;
        // transform: translateY(0px);
    }
    .view-leave-to {
        opacity: 0;
        // transform: translateY(-50px);
    }
    .lightMode {
        .el-menu {
            background-color: rgb(248, 248, 248);
        }
        .top-navbar {
            box-shadow: 0px -6px 10px 7px rgba(148, 148, 148);
        }
        .el-menu-item {
            color: @link-color-red !important;
        }
        .search-button {
            background: #eee;
            border-color: #222;
            color: black;
        }
        .el-menu-item:hover.menu-item-nobg {
            background-color: rgb(248, 248, 248) !important;
        }
        .search-dropdown {
            background-color: rgb(248, 248, 248) !important;
        }
        .dropdown-item:hover {
            background: #eee !important;
        }
    }
    @media (max-width: 767px) {                  
        .top-navbar {
            position: fixed;
            top: inherit;
            left: 0;
            bottom:0;
            box-shadow: none;
            border-top: 1px solid #222 !important;
            display: flex;
            justify-content: space-around;
            li {
                width: 100%;
                a {
                    div {
                        // display: flex;
                        text-align: center;
                    }
                }
            }
        }
        .main-router {
            margin-top: 0;
            margin-bottom: 5em;
        }
        .menu-center-item {
            left: auto;
        }
        .search-dropdown {
            width: 80%;
            left: 1em;
        }
        // .first-menu-item {
        //     margin-left: 1em !important;
        // }
        .el-menu-item {
            color: @text-color !important;
            margin: 0 0.6rem !important;
        }
        .search-menu-item {
            width: 80%;
            margin-left: 0 !important;
            left: 0.5em;
            padding: 0;
            // position: relative !important;
        }
        .search-dropdown {
            width: 100%;
            max-height: 30em;
            left: 0;
        }
        .user-menu-item {
            display: flex;
            flex-direction: row-reverse;
        }
    }
</style>
