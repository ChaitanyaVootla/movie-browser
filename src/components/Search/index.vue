<template>
    <div>
        <div class="query-info text-muted">
            <div class="">
                {{ queryData.total_results === 10000 ? `${queryData.total_results}+` : queryData.total_results }}
                result{{ queryData.total_results > 1 ? 's' : '' }}
            </div>
        </div>
        <div class="discover-movies-container">
            <movie-card
                v-for="movie in searchResults"
                :movie="movie"
                :configuration="configuration"
                :imageRes="'w500'"
                :onSelected="showMovieInfo"
                :key="movie.id"
                :showFullMovieInfo="showFullMovieInfo"
            ></movie-card>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '../../API/api';
import _ from 'lodash';

export default {
    name: 'search',
    props: ['configuration', 'searchString', 'showMovieInfo', 'showFullMovieInfo'],
    data() {
        return {
            searchResults: [],
            queryData: {
                results: [],
            },
            currentPage: 1,
        };
    },
    created() {
        this.executeSearch();
        const self = this;
        window.onscroll = function () {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
                self.fetchMore();
            }
        };
    },
    methods: {
        executeSearch: _.debounce(async function (this: any) {
            if (this.searchString.length > 1) {
                this.currentPage = 1;
                $('.search-dropdown')[0].scrollTop = 0;
                const response = await api.searchMovies(this.searchString, this.currentPage);
                this.queryData = response;
                this.searchResults = response.results;
                this.fetchMore();
            }
        }, 200),
        fetchMore: _.debounce(async function (this: any) {
            for (let count = 1; count < 3; count++) {
                this.currentPage++;
                const response = await api.searchMovies(this.searchString, this.currentPage);
                this.searchResults = this.searchResults.concat(response.results);
            }
        }, 200),
    },
    watch: {
        searchString: async function (newQuery, oldQuery) {
            await this.executeSearch();
        },
    },
};
</script>

<style scoped>
.discover-movies-container {
    padding: 1em 2.5em;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
}
::v-deep .movie-item {
    margin-left: 0.5em;
    margin-right: 0.5em;
    margin-bottom: 2em;
}
.query-info {
    padding: 1em 0 0 3em;
    font-weight: 500;
    display: flex;
}
.back-icon {
    color: bisque;
}
.modal-xl {
    max-width: 90%;
}
</style>
