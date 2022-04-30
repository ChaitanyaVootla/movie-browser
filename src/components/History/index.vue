<template>
    <div>
        <el-tabs v-model="activeTab" class="history-container">
            <el-tab-pane label="Movies" name="movies">
                <search-grid
                    :movies="historyMovies"
                    :configuration="configuration"
                    :imageRes="'w500'"
                    :onSelected="showMovieInfo"
                    :showFullMovieInfo="showFullMovieInfo"
                    :genres="movieGenres"
                ></search-grid>
            </el-tab-pane>
            <el-tab-pane label="Series" name="series">
                <div class="discover-movies-container">
                    <search-grid
                        :movies="seriesHistory"
                        :configuration="configuration"
                        :imageRes="'w500'"
                        :onSelected="showMovieInfo"
                        :showFullMovieInfo="showFullMovieInfo"
                        :genres="seriesGenres"
                    ></search-grid>
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<script lang="ts">
export default {
    name: 'history',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            activeTab: 'movies',
        };
    },
    computed: {
        historyMovies() {
            return this.$store.getters.history.movies;
        },
        seriesHistory() {
            return this.$store.getters.history.series;
        },
    },
};
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
