<template>
    <div>
        <el-menu default-active="1-1" class="vertical-menu" :collapse="isMobile" :default-openeds="['1', '2']">
            <el-submenu index="1">
                <template slot="title">
                    <font-awesome-icon :icon="['fas', 'film']" class="mr-2" />
                    <span slot="title">Movies</span>
                </template>
                <el-menu-item index="1-1" @click="selectedItem = 'watchListMovies'">Watch List</el-menu-item>
                <el-menu-item index="1-2" @click="selectedItem = 'watchedMovies'">Watched</el-menu-item>
            </el-submenu>
            <el-submenu index="2">
                <template slot="title">
                    <font-awesome-icon :icon="['fas', 'stream']" class="mr-2" />
                    <span slot="title">Series</span>
                </template>
                <el-menu-item index="2-1" @click="selectedItem = 'watchListSeries'">Watch List</el-menu-item>
            </el-submenu>
            <el-menu-item index="3">
                Show all results
                <el-switch class="ml-2" v-model="showAllEnabled" active-color="#13ce66" inactive-color="#ff4949">
                </el-switch>
            </el-menu-item>
        </el-menu>
        <div class="history-container">
            <search-grid
                :movies="currentItems"
                :configuration="configuration"
                :imageRes="'w500'"
                :onSelected="showMovieInfo"
                :showFullMovieInfo="showFullMovieInfo"
                :genres="movieGenres"
            ></search-grid>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
    name: 'Profile',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            selectedItem: 'watchListMovies',
            get showAllEnabled() {
                return localStorage.getItem('showAllResults') && localStorage.getItem('showAllResults') == 'true'
                    ? true
                    : false;
            },
            set showAllEnabled(value: boolean) {
                localStorage.setItem('showAllResults', value ? 'true' : 'false');
            },
        };
    },
    computed: {
        currentItems() {
            return this[this.selectedItem];
        },
        watchedMovies() {
            return this.$store.getters.watched.movies;
        },
        watchListMovies() {
            return this.$store.getters.watchListMovies;
        },
        watchListSeries() {
            return this.$store.getters.watchListSeries;
        },
        isMobile() {
            return window.innerWidth < 768 ? true : false;
        },
    },
});
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';

/deep/ .movie-item {
    margin-left: 0.5em;
    margin-right: 0.5em;
    margin-bottom: 2em;
}
.history-container {
    padding: 1em 4em;
    margin-left: 10em;
}
/deep/ .el-tabs__nav-wrap::after {
    background-color: #222;
}
.vertical-menu {
    border-right: 1px solid #222;
    background-color: @primary-gray;
}
/deep/ .el-menu.el-menu--inline {
    background-color: #191919;
}
.vertical-menu:not(.el-menu--collapse) {
    width: 200px;
    height: 94vh;
    position: absolute;
}
/deep/ .el-menu-item.is-active {
    background-color: black;
    color: @link-color-red;
}
@media (max-width: 767px) {
    .vertical-menu {
        width: 4em;
        height: 94vh;
        position: absolute;
    }
    .history-container {
        padding: 0.5em;
        margin-left: 4em;
    }
}
</style>
