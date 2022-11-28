<template>
    <div class="primary-container">
        <el-menu
            class="top-navbar"
            mode="horizontal"
            background-color="#0f0f0f"
            text-color="#eee"
            :default-active="activeNavItem"
            active-text-color="#b91d1d"
        >
            <el-menu-item index="Trending" class="first-menu-item p-0 nav-menu-item">
                <router-link :to="{ name: 'trending' }">
                    <div class="pl-4 pr-4 flex-nav-item" :class="onTrending ? 'active' : ''">
                        <i class="fa-solid fa-house pr-2"></i>
                        <div class="">Home</div>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="discover" class="nav-menu-item p-0">
                <router-link :to="{ name: 'discover' }">
                    <div class="pl-4 pr-4 flex-nav-item" :class="onDiscover ? 'active' : ''">
                        <i class="fa-solid fa-photo-video mr-2"></i>
                        <div class="">Browse</div>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="WatchList" class="nav-menu-item p-0">
                <router-link :to="{ name: 'WatchList' }">
                    <div class="pl-4 pr-4 flex-nav-item" :class="onWatchList ? 'active' : ''">
                        <i class="fa-solid fa-bars-staggered mr-2"></i>
                        <div class="">Watch List</div>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item v-if="user.isAdmin" index="Admin" class="nav-menu-item p-0">
                <router-link :to="{ name: 'admin' }">
                    <div class="pl-4 pr-4 flex-nav-item" :class="onAdmin ? 'active' : ''">
                        <i class="fa-solid fa-lock mr-2"></i>
                        <div class="">Admin</div>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item
                index="app-logo"
                class="menu-center-item menu-item-nobg mobile-hide"
                aria-label="Home"
                @click="logoClicked"
            >
                <router-link :to="{ name: 'home' }" title="home">
                    <div class="app-logo">
                        <i class="fa-solid fa-clapperboard"></i>
                    </div>
                </router-link>
            </el-menu-item>
            <el-menu-item index="search" class="menu-item-nobg search-menu-item mobile-hide">
                <div @keydown.stop>
                    <el-autocomplete
                        v-model="autoSearchText"
                        :fetch-suggestions="autocompleteSearch"
                        placeholder="Search"
                        class="autoCompleteSearch"
                        min="2"
                        id="autoCompleteSearch"
                        :highlight-first-item="true"
                        :hide-loading="true"
                        ref="searchInput"
                        @select="searchItemclicked"
                    >
                        <!-- <div slot="suffix">
                            <span class="search-shortcut">/</span>
                        </div> -->
                        <div slot="suffix">
                            <i class="el-icon-search"></i>
                        </div>
                        <template slot-scope="{ item }">
                            <SearchResult
                                :searchItem="item"
                                :get-genre-name-from-id="getGenreNameFromId"
                                :image-base-path="imageBasePath"
                            />
                        </template>
                    </el-autocomplete>
                </div>
            </el-menu-item>
            <el-menu-item class="menu-item-right menu-item-nobg mr-4 user-menu-item mobile-hide" aria-label="Settings">
                <div>
                    <div v-if="!user.name" class="mt-1">
                        <div
                            v-if="loginUrl.length"
                            id="g_id_onload"
                            data-client_id="997611698244-2svdjnmr6bpl2k97togvmktg4l4shs81.apps.googleusercontent.com"
                            :data-login_uri="loginUrl + '/auth/callback'"
                            data-skip_prompt_cookie="googleonetap"
                        >
                        </div>
                        <div
                            class="g_id_signin mt-3"
                            data-type="icon"
                            data-size="medium"
                            data-shape="circle"
                            data-theme="outline"
                            data-text="sign_in_with"
                            data-logo_alignment="left"
                        >
                        </div>
                    </div>
                </div>
                <div>
                    <el-dropdown trigger="click" aria-label="Settings">
                        <div v-show="user.name">
                            <img v-lazy="{ src: user.picture }" class="user-photo" />
                        </div>
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item v-if="countryName" class="country-flag">
                                <span class="mr-2">{{ countryName }}</span>
                                <img height="15px" :src="countryFlag" />
                            </el-dropdown-item>
                            <el-dropdown-item :divided="countryName.length > 0">
                                <router-link :to="{ name: 'Interests' }">
                                    <i class="fa-solid fa-user mr-1"></i>
                                    Profile
                                </router-link>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <router-link :to="{ name: 'Sandbox' }">
                                    <i class="fa-solid fa-flask mr-1"></i>
                                    Sandbox
                                </router-link>
                            </el-dropdown-item>
                            <el-dropdown-item divided>
                                <a
                                    href="https://github.com/ChaitanyaVootla/movie-browser"
                                    rel="noopener"
                                    target="_blank"
                                >
                                    <i class="fa-brands fa-github mr-1"></i>
                                    Github Repo
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                    <i class="fa-solid fa-film mr-1"></i>
                                    TMDB
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                    <i class="fa-solid fa-file-alt mr-1"></i>
                                    TMDB Docs
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item divided>
                                <div @click="signOutClicked">
                                    <i class="fa-solid fa-sign-out-alt mr-1"></i>
                                    Sign out
                                </div>
                                <div v-if="user.isAdmin">
                                    <router-link :to="{ name: 'admin' }">
                                        <i class="fa-solid fa-lock mr-1"></i>
                                        Admin
                                    </router-link>
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
                                <i class="fa-brands fa-github mr-1"></i>
                                Github Repo
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                <i class="fa-solid fa-film mr-1"></i>
                                TMDB
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item>
                            <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                <i class="fa-solid fa-file-alt mr-1"></i>
                                TMDB Docs
                            </a>
                        </el-dropdown-item>
                        <el-dropdown-item v-if="isAllResultsShown">
                            <div @click="removeAllResultsShown"> Clear cache </div>
                        </el-dropdown-item>
                    </el-dropdown-menu>
                </el-dropdown>
            </el-menu-item>
        </el-menu>
        <el-menu class="desk-hide" :default-active="activeNavItem" mode="horizontal">
            <el-menu-item index="search" class="menu-item-nobg search-menu-item">
                <div>
                    <el-autocomplete
                        v-model="autoSearchText"
                        :fetch-suggestions="autocompleteSearch"
                        placeholder="Search"
                        class="autoCompleteSearch"
                        min="2"
                        :highlight-first-item="true"
                        @select="searchItemclicked"
                    >
                        <i class="el-icon-search" slot="suffix"> </i>
                        <template slot-scope="{ item }">
                            <SearchResult
                                :searchItem="item"
                                :get-genre-name-from-id="getGenreNameFromId"
                                :image-base-path="imageBasePath"
                            />
                        </template>
                    </el-autocomplete>
                </div>
            </el-menu-item>
            <el-menu-item class="menu-item-right menu-item-nobg ml-2 user-menu-item" aria-label="Settings">
                <div v-if="!user.name" class="mt-1 desk-hide">
                    <div
                        v-if="loginUrl.length"
                        id="g_id_onload"
                        data-client_id="997611698244-2svdjnmr6bpl2k97togvmktg4l4shs81.apps.googleusercontent.com"
                        :data-login_uri="loginUrl + '/auth/callback'"
                        data-skip_prompt_cookie="googleonetap"
                    >
                    </div>
                </div>
                <div v-if="!user.name" class="desk-hide">
                    <div
                        class="g_id_signin mt-3"
                        data-type="icon"
                        data-size="medium"
                        data-shape="circle"
                        data-theme="outline"
                        data-text="sign_in_with"
                        data-logo_alignment="left"
                    >
                    </div>
                </div>
                <div v-else>
                    <el-dropdown trigger="click" aria-label="Settings">
                        <img :src="user.photoURL" class="user-photo" />
                        <el-dropdown-menu slot="dropdown">
                            <el-dropdown-item>
                                <router-link :to="{ name: 'Interests' }">
                                    <i class="fa-solid fa-user mr-1"></i>
                                    Profile
                                </router-link>
                            </el-dropdown-item>
                            <el-dropdown-item divided>
                                <a
                                    href="https://github.com/ChaitanyaVootla/movie-browser"
                                    rel="noopener"
                                    target="_blank"
                                >
                                    <i class="fa-brands fa-github mr-1"></i>
                                    Github Repo
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://www.themoviedb.org/" rel="noopener" target="_blank">
                                    <i class="fa-solid fa-film mr-1"></i>
                                    TMDB
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item>
                                <a href="https://developers.themoviedb.org/3" rel="noopener" target="_blank">
                                    <i class="fa-solid fa-file-alt mr-1"></i>
                                    TMDB Docs
                                </a>
                            </el-dropdown-item>
                            <el-dropdown-item divided>
                                <div @click="signOutClicked">
                                    <i class="fa-solid fa-sign-out-alt mr-1"></i>
                                    Sign out
                                </div>
                            </el-dropdown-item>
                        </el-dropdown-menu>
                    </el-dropdown>
                </div>
            </el-menu-item>
        </el-menu>
        <transition name="view">
            <router-view
                v-if="isLoaded"
                class="main-router"
                :isLoaded="isLoaded"
                :configuration="configuration"
                :searchString="searchText"
                :person="selectedPerson"
                :showFullMovieInfo="showFullMovieInfo"
                :selectPerson="goToPerson"
                :showSeriesInfo="showSeriesInfo"
                :movieGenres="movieGenres"
                :seriesGenres="seriesGenres"
            ></router-view>
        </transition>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { sanitizeName } from '@/common/utils';
import { throttle, find, sortBy } from 'lodash';
import { configuration, movieGenres, seriesGenres } from '@/common/staticConfig';
import anime from 'animejs';
import Vue from 'vue';
import SearchResults from '@/components/SearchResults/index.vue';
import SearchResult from '@/components/Common/searchResult.vue';

export default Vue.extend({
    name: 'home',
    data: function () {
        return {
            configuration,
            genres: [] as any[],
            movieGenres,
            seriesGenres,
            isLoaded: false,
            searchText: '',
            autoSearchText: '',
            searchResults: [],
            imageBasePath: '',
            selectedMovie: {},
            currentRoute: {} as any,
            selectedPerson: {},
            showSearchResults: true,
            showDrawer: false,
            logoAnimation: null,
        };
    },
    components: {
        SearchResults,
        SearchResult,
    },
    created() {
        this.loadData();
        this.currentRoute = this.$route;
    },
    mounted() {
        $('.search-dropdown, .search-intput-container').click(function (event) {
            event.stopPropagation();
        });
        window.addEventListener('keypress', this.onKeyPress);
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
        countryName() {
            return (this.user?.country?.name || '').toUpperCase();
        },
        countryFlag() {
            return 'https://cdn.statically.io/flags/' + (this.user?.country?.id || '').toLocaleLowerCase() + '.svg';
        },
        loginUrl() {
            if (window.location.hostname == 'localhost') {
                return 'http://localhost:3000';
            } else {
                return 'https://themoviebrowser.com/node';
            }
        },
        isAllResultsShown() {
            return localStorage.getItem('showAllResults') == 'true';
        },
        user() {
            return this.$store.getters.user;
        },
        oneTapUser() {
            return this.$store.getters.oneTapUser;
        },
        onStreamingNow() {
            return this.$route.name === 'StreamingNow';
        },
        onWatchList() {
            return this.$route.name === 'WatchList';
        },
        onAdmin() {
            return this.$route.name === 'admin';
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
        },
    },
    methods: {
        removeAllResultsShown() {
            localStorage.setItem('showAllResults', 'false');
            window.location.reload();
        },
        logoClicked() {
            this.logoAnimation.play();
        },
        signOutClicked() {
            api.signOutOneTap().then(() => location.reload());
        },
        searchItemclicked(item: any) {
            if (item.media_type === 'movie') {
                this.$router
                    .push({
                        name: 'movieInfoFull',
                        params: {
                            name: sanitizeName(item.title || item.name),
                            id: item.id,
                        },
                    })
                    .catch((err) => {});
            } else if (item.media_type === 'tv') {
                this.$router
                    .push({
                        name: 'seriesInfo',
                        params: {
                            name: sanitizeName(item.name),
                            id: item.id,
                        },
                    })
                    .catch((err) => {});
            } else if (item.media_type === 'person') {
                this.$router
                    .push({
                        name: 'person',
                        params: {
                            name: sanitizeName(item.name),
                            id: item.id,
                        },
                    })
                    .catch((err) => {
                        console.log(err);
                    });
            }
        },
        async loadData() {
            this.genres = movieGenres;
            this.imageBasePath = configuration.images.secure_base_url + 'w500';
            this.isLoaded = true;
        },
        autocompleteSearch(searchQuery, callBack) {
            if (searchQuery.length > 2) {
                api.searchAll(searchQuery, 1).then((response) => {
                    callBack(response.results);
                });
            } else {
                callBack([]);
            }
        },
        getGenreNameFromId(id: number) {
            const genre = find(this.genres, { id: id });
            if (genre) {
                return genre.name;
            }
        },
        showFullMovieInfo(movie: any) {
            if (movie.first_air_date) {
                return this.showSeriesInfo(movie);
            }
            this.$router
                .push({
                    name: 'movieInfoFull',
                    params: {
                        name: sanitizeName(movie.title || movie.name),
                        id: movie.id,
                    },
                })
                .catch((err) => {});
        },
        showSeriesInfo(series: any) {
            this.$router
                .push({
                    name: 'seriesInfo',
                    params: {
                        name: sanitizeName(series.name),
                        id: series.id,
                    },
                })
                .catch((err) => {});
        },
        goToDiscover() {
            this.$router
                .push({
                    name: 'discover',
                })
                .catch((err) => {});
        },
        goToPerson(person: any) {
            this.closeInfo();
            this.selectedPerson = person;
            this.$router.push({
                name: 'person',
                params: {
                    name: sanitizeName(person.name),
                    id: person.id,
                },
            });
        },
        goToSearch() {
            if (this.searchText.length > 2) {
                this.$router
                    .push({
                        name: 'search',
                    })
                    .catch((err) => {});
            }
        },
        onKeyPress(event: any) {
            if (event.key !== '/') {
                return;
            }
            if (document.activeElement === this.$refs.searchInput) {
                return;
            }
            event.preventDefault();
            this.$refs.searchInput.focus();
        },
    },
    beforeDestroy() {
        window.removeEventListener('keypress', this.onKeyPress);
    },
    watch: {
        $route(currentRoute) {
            this.currentRoute = currentRoute;
        },
    },
});
</script>

<style scoped lang="less">
@import '../Assets/Styles/main.less';

.app-logo {
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
.country-flag {
    font-weight: 600;
}
.autoCompleteSearch {
    width: 100%;
    /deep/ #autoCompleteSearch {
        border-radius: 1rem;
    }
    .search-shortcut {
        border: 1px #444 solid;
        padding: 2px 10px;
        border-radius: 5px;
        margin-right: 0.5rem;
    }
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
.trending-icon {
    font-size: 1.2em;
    height: 10px;
}
/deep/ .search-append-button .el-input-group__append {
    border: 1px solid #222 !important;
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
    padding: 0 !important;
    width: 100% !important;
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
    box-shadow: 0px 30px 60px 20px rgba(0, 0, 0, 0.95);
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
    display: flex;
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
    outline: 2px solid @main-red;
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
.view-enter-active,
.view.leave-active {
    transition: opacity 0.2s ease-in-out, transform 0.2s ease;
    animation: bounce-in 0.4s;
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
}
.view-enter-to {
    opacity: 1;
}
.view-leave {
    opacity: 1;
}
.view-leave-to {
    opacity: 0;
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
.nav-menu-item {
    .flex-nav-item {
        display: flex;
        align-items: center;
        svg {
            height: 1.2rem;
            vertical-align: middle;
        }
        font-weight: 500;
        font-size: 1.1em;
    }
}
@media (max-width: 767px) {
    .nav-menu-item {
        .flex-nav-item {
            display: flex;
            align-items: center;
            flex-direction: column;
            padding: 10px 0;
            svg {
                font-size: 1em;
                height: 1.2rem;
                width: 100%;
            }
            div {
                padding-top: 10px;
                line-height: 10px;
                font-size: 0.8em;
                color: #ccc;
            }
        }
    }
    .top-navbar {
        position: fixed;
        top: inherit;
        left: 0;
        bottom: 0;
        box-shadow: none;
        border-top: 1px solid #222 !important;
        display: flex;
        justify-content: space-around;
        li {
            width: 100%;
            a {
                div {
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
    .el-menu-item {
        color: @text-color !important;
        margin: 0 0.6rem !important;
    }
    .search-menu-item {
        width: 80%;
        margin-left: 0 !important;
        left: 0.5em;
        padding: 0;
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
