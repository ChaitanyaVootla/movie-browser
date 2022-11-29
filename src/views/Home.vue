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
                <div @keydown.stop class="width-100">
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
                        :fit-input-width="true"
                        @select="searchItemclicked"
                    >
                        <!-- <div slot="suffix">
                            <span class="search-shortcut">/</span>
                        </div> -->
                        <template #suffix>
                            <i class="fa-solid fa-magnifying-glass"></i>
                        </template>
                        <template #default="{ item }">
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
                <div style="margin-top: -0.6rem;">
                    <el-dropdown trigger="click" aria-label="Settings">
                        <div v-show="user.name">
                            <img v-lazy="{ src: user.picture }" class="user-photo" />
                        </div>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item v-if="countryName" class="country-flag">
                                    <span class="mr-2">{{ countryName }}</span>
                                    <img :src="countryFlag" />
                                </el-dropdown-item>
                                <el-dropdown-item :divided="countryName.length > 0">
                                    <router-link :to="{ name: 'Profile' }">
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
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </div>
            </el-menu-item>
            <el-menu-item v-if="!user.picture" index="settings" class="menu-item-right menu-item-nobg p-0 mobile-hide">
                <el-dropdown trigger="click">
                    <div><i class="el-icon-s-tools" aria-label="Settings"></i></div>
                    <template #dropdown>
                        <el-dropdown-menu>
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
                    </template>
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
                        <template #suffix>
                            <i class="el-icon-search"></i>
                        </template>
                        <template #default="{ item }">
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
                        <img :src="user.picture" class="user-photo" /> asd
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item>
                                    <router-link :to="{ name: 'Profile' }">
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
                        </template>
                    </el-dropdown>
                </div>
            </el-menu-item>
        </el-menu>
        <transition name="el-fade-in-linear">
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
import { find } from 'lodash';
import { configuration, movieGenres, seriesGenres } from '@/common/staticConfig';
import SearchResult from '@/components/Common/searchResult.vue';

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
            } else if (this.$route.name === 'Profile') {
                return 'Profile';
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
};
</script>

<style scoped lang="less">
@import '../Assets/Styles/main.less';

/deep/ .haAclf {
    background: black;
}
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
    img {
        height: 1rem;
    }
}
/deep/ .autoCompleteSearch {
    width: 100%;
    display: flex;
    align-items: center;
    .el-input__wrapper {
        border-radius: 1rem;
    }
    /deep/ #autoCompleteSearch {
        border-radius: 1rem;
        margin-top: -3px;
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
    a {
        height: 100%;
    }
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
    box-shadow: 0px -6px 10px 7px rgba(167, 167, 167, 0.1);
    position: fixed;
    width: 100%;
    z-index: 100;
    top: 0;
    display: block;
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
    .user-menu-item {
        display: flex;
        flex-direction: row-reverse;
    }
}
</style>
