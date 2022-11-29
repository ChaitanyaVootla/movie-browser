<template>
    <div>
        <div class="search-grid-container pt-2 pb-3 pl-2 pr-2">
            <el-select v-model="selectedSortOrder" value-key="id" placeholder="Sort By" class="full-width">
                <el-option v-for="item in sortOrders" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select
                v-model="selectedGenres"
                multiple
                filterable
                :collapse-tags="true"
                placeholder="Genres"
                :no-match-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
            >
                <el-option v-for="item in genres" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select
                v-model="selectedKeywords"
                multiple
                filterable
                remote
                :remote-method="keywordChanged"
                placeholder="Looking for anything specific?"
                :no-data-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
            >
                <el-option v-for="item in searchKeywords" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select v-model="selectedRating" value-key="id" clearable placeholder="Rating">
                <el-option v-for="item in ratingOptions" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
        </div>
        <div class="text-muted pl-3 pb-2"> {{ filteredMovies.length }} Results </div>
        <div v-if="!filteredMovies.length" class="no-items-text">
            <router-link :to="{ name: 'discover' }">
                Looks like you have nothing in this list <br />
                <i class="fa-solid fa-photo-film mr-2"></i> Try Discovering movies/series
            </router-link>
        </div>
        <div class="movies-grid-container">
            <movie-card
                v-for="movie in filteredMovies"
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
import { api } from '@/API/api';
import { uniqBy, intersection, sortBy } from 'lodash';
export default {
    name: 'searchGrid',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'genres', 'movies'],
    data() {
        return {
            selectedGenres: [] as any[],
            selectedRating: {} as any,
            selectedKeywords: [] as any[],
            searchKeywords: [] as any[],
            ratingOptions: [] as any[],
            selectedSortOrder: {
                name: 'Browse Date',
                id: 'browseDate',
            },
            sortOrders: [
                {
                    name: 'Browse Date',
                    id: 'browseDate',
                },
                {
                    name: 'Popularity',
                    id: 'popularity.desc',
                },
                {
                    name: 'Rating',
                    id: 'vote_average.desc',
                },
            ],
        };
    },
    computed: {
        filteredMovies() {
            let filteredMovies = this.movies as any[];
            const selectedGenreIds = this.selectedGenres.map(({ id }) => id);
            if (selectedGenreIds.length) {
                filteredMovies = filteredMovies.filter((movie) => {
                    return (
                        intersection(
                            selectedGenreIds,
                            movie.genres.map(({ id }) => id),
                        ).length === selectedGenreIds.length
                    );
                });
            }
            const selectedKeywordIds = this.selectedKeywords.map(({ id }) => id);
            if (selectedKeywordIds.length) {
                filteredMovies = filteredMovies.filter((movie) => {
                    return (
                        intersection(
                            selectedKeywordIds,
                            movie.keywords.keywords.map(({ id }) => id),
                        ).length === selectedKeywordIds.length
                    );
                });
            }
            if (this.selectedSortOrder) {
                if (this.selectedSortOrder.name === 'Popularity') {
                    filteredMovies = sortBy(filteredMovies, 'popularity').reverse();
                } else if (this.selectedSortOrder.name === 'Rating') {
                    filteredMovies = sortBy(filteredMovies, 'vote_average').reverse();
                }
            }
            if (this.selectedRating.id) {
                filteredMovies = filteredMovies.filter(({ vote_average }) => vote_average >= this.selectedRating.id);
            }
            return filteredMovies;
        },
    },
    created() {
        this.setupRatingOptions();
    },
    methods: {
        async keywordChanged(word: any) {
            if (word.length > 1) {
                const fetchedKeywords = await api.searchKeywords(word);
                this.searchKeywords = uniqBy(fetchedKeywords.concat(this.selectedKeywords), 'id');
            }
        },
        setupRatingOptions() {
            this.ratingOptions = new Array(10).fill({});
            this.ratingOptions.forEach((item, index) => {
                this.ratingOptions[index] = {
                    id: index,
                    name: `${index}+`,
                };
            });
            this.ratingOptions.reverse();
        },
    },
};
</script>

<style lang="less" scoped>
@import '../../Assets/Styles/main.less';
/deep/ .movie-item {
    margin: 0;
    padding: 0;
}
.full-width {
    width: 100%;
}
.search-grid-container {
    display: grid;
    grid-template-columns: 3fr 4fr 5fr 2fr repeat(13, 1fr);
    gap: 0.5em;
    width: 100%;
}
@media (max-width: 767px) {
    .search-grid-container {
        grid-template-columns: repeat(2, 1fr);
        padding: 0.5em !important;
        margin: 0 !important;
        gap: 0.5em;
    }
    /deep/ .movie-item {
        width: @mobile-mini-card-width !important;
        height: auto !important;
    }
    /deep/ .movie-card-image {
        width: @mobile-mini-card-width !important;
        height: auto !important;
    }
    .movies-grid-container {
        grid-template-columns: repeat(auto-fill, @mobile-mini-card-width);
    }
}
.no-items-text {
    width: 100%;
    text-align: center;
    margin-top: 2em;
    text-decoration: underline;
}
</style>
