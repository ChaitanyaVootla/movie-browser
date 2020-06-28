<template>
    <div>
        <el-tabs v-model="activeTab" class="history-container">
            <el-tab-pane label="Watched Movies" name="Watched Movies">
                <search-grid :movies="watchedMovies" :configuration="configuration" :imageRes="'w500'"
                    :onSelected="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
                    :genres="movieGenres"></search-grid>
            </el-tab-pane>
            <el-tab-pane label="Movies Watch List" name="Movies Watch List">
                <search-grid :movies="watchListMovies" :configuration="configuration" :imageRes="'w500'"
                    :onSelected="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"
                    :genres="seriesGenres"></search-grid>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<script lang="ts">
    import Vue from 'vue'
    export default {
        name: 'trending',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
        ],
        data() {
            return {
                activeTab: 'Watched Movies',
            }
        },
        computed: {
            watchedMovies() {
                return this.$store.getters.watched.movies;
            },
            watchListMovies() {
                return this.$store.getters.watchListMovies;
            },
        }
    }
</script>

<style lang="less" scoped>
    /deep/ .movie-item {
        margin-left: 0.5em;
        margin-right: 0.5em;
        margin-bottom: 2em;
    }
    .history-container {
        padding: 1em 4em;
    }
    /deep/ .el-tabs__nav-wrap::after {
        background-color: #222;
    }
</style>