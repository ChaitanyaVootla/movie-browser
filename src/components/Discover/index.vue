<template>
    <div>
        <div class="pt-4 pl-5 pb-2 discover-options-row">
            <el-row>
                <el-col :span="2">
                    <el-select v-model="selectedSortOrder" value-key="id" placeholder="Sort By" class="full-width">
                        <el-option
                            v-for="item in sortOrders"
                            :key="item.id"
                            :label="item.name"
                            :value="item">
                        </el-option>
                    </el-select>
                </el-col>
                <el-col :span="3" class="pl-2">
                    <el-select v-model="selectedGenres" multiple filterable :collapse-tags="true" placeholder="Genres"
                        :no-match-text="'No Results'" value-key="id" class="full-width" clearable>
                        <el-option
                            v-for="item in genres"
                            :key="item.id"
                            :label="item.name"
                            :value="item">
                        </el-option>
                    </el-select>
                </el-col>
                <el-col :span="5" class="pl-2">
                    <el-select v-model="selectedKeywords" multiple filterable remote
                        :remote-method="keywordChanged" placeholder="Keywords"
                        :no-data-text="'No Results'" value-key="id" class="full-width" clearable>
                        <el-option
                            v-for="item in searchKeywords"
                            :key="item.id"
                            :label="item.name"
                            :value="item">
                        </el-option>
                    </el-select>
                </el-col>
                <el-col :span="2" :offset="7" class="pl-5">
                        <el-select v-model="selectedRating" value-key="id" clearable placeholder="Rating">
                            <el-option
                                v-for="item in ratingOptions"
                                :key="item.id"
                                :label="item.name"
                                :value="item">
                            </el-option>
                        </el-select>
                </el-col>
                <el-col :span="3" class="pl-5">
                    <div class="mt-2">
                        <span class="mr-2">Series</span>
                        <el-switch class="type-switch"
                            v-model="isMovies"
                            active-color="#333"
                            inactive-color="#000"
                            @change="typeChanged">
                        </el-switch>
                        <span class="ml-2">Movies</span>
                    </div>
                </el-col>
                <el-col :span="2">
                    <el-button @click="loadMovies(true)" class="search-btn">
                        <font-awesome-icon :icon="['fas', 'search']" class="mr-2"/> Search
                    </el-button>
                </el-col>
            </el-row>
        </div>
        <div class="query-info text-muted">
            <div class="">
                {{queryData.total_results === 10000?`${queryData.total_results}+`:queryData.total_results}} results
            </div>
        </div>
        <div v-if="isLoaded" class="discover-movies-container">
            <movie-card v-for="movie in movies" :movie="movie" :configuration="configuration" :imageRes="'w500'"
                :onSelected="showMovieInfo" :key="movie.id" :showFullMovieInfo="showFullMovieInfo"></movie-card>
        </div>
        <div class="loader-main" v-if="isDataLoading"></div>
    </div>
</template>

<script lang="ts">
    import { Component, Prop, Vue } from 'vue-property-decorator';
    import { api } from '../../API/api';
    import _ from 'lodash';
    import { movieParams, seriesParams } from '@/API/Constants';

    export default {
        name: 'movieDiscover',
        props: [
            'configuration',
            'queryParams',
            'showMovieInfo',
            'showFullMovieInfo',
            'movieGenres',
            'seriesGenres',
        ],
        data() {
            return {
                isLoaded: false,
                isDataLoading: true,
                movies: [] as any[],
                queryData: {
                    results: []
                },
                sortOrders: [
                    {
                        name: 'Popularity',
                        id: 'popularity.desc'
                    },
                    {
                        name: 'Rating',
                        id: 'vote_average.desc'
                    }
                ],
                currentPage: 1,
                isMovies: true,
                computedDiscoverQuery: '',
                ratingOptions: [] as any[],
                selectedRating: {} as any,
                selectedKeywords: [] as any[],
                searchKeywords: [] as any[],
                genres: [] as any[],
                selectedGenres: [] as any[],
                dateRange: {},
                selectedSortOrder: {
                    name: 'Popularity',
                    id: 'popularity.desc'
                },
                routeQueryPresent: false,
            }  
        },
        beforeDestroy() {
            window.removeEventListener('scroll', this.scrollHandler);
        },
        created() {
            this.setupRatingOptions();
            this.genres = this.movieGenres;
            this.checkRouteQuery();
            this.loadMovies(false);
            window.addEventListener('scroll', this.scrollHandler);
        },
        watch: {
            $route (to, from) {
                this.currentPage = 1;
                this.checkRouteQuery();
                this.loadMovies(false);
            }
        },
        methods: {
            scrollHandler() {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
                   this.loadMoreMovies();
                }
            },
            setupRatingOptions() {
                this.ratingOptions = new Array(10).fill({});
                this.ratingOptions.forEach(
                    (item, index) => {
                        this.ratingOptions[index] = {
                            id: index,
                            name: `${index}+`
                        };
                    }
                );
                this.ratingOptions.reverse();
            },
            checkRouteQuery() {
                const routeQuery = this.$route.query;
                if (routeQuery.sort_by) {
                    this.routeQueryPresent = true;
                    if (routeQuery.sort_by === 'vote_average.desc') {
                        this.selectedSortOrder = {
                            name: 'Rating',
                            id: 'vote_average.desc'
                        };
                    }
                }
                if (routeQuery.with_genres) {
                    const genreIds = `${routeQuery.with_genres}`.split(',');
                    const allGenres = this.movieGenres.concat(this.seriesGenres);
                    this.selectedGenres = [];
                    genreIds.forEach(
                        (id) => {
                            const genre = _.find(allGenres, {id: parseInt(id)});
                            this.selectedGenres.push(genre);
                        }
                    )
                }
                if (routeQuery.with_keywords && routeQuery.keywords) {
                    const keywordIds = `${routeQuery.with_keywords}`.split(',');
                    const keywords = `${routeQuery.keywords}`.split(',');
                    const selectedKeywords = [];
                    keywordIds.forEach(
                        (id, index) => {
                            this.selectedKeywords.push({
                                id: parseInt(id),
                                name: keywords[index]
                            });
                        }
                    );
                    this.selectedKeywords = _.uniqBy(this.selectedKeywords, 'id');
                    this.searchKeywords = this.selectedKeywords;
                }
                if (routeQuery.isMovies == 'false') {
                    this.isMovies = false;
                    this.genres = this.seriesGenres;
                }
                if (routeQuery.rating) {
                    this.selectedRating = {
                        id: parseInt(`${routeQuery.rating}`),
                        name: `${routeQuery.rating}+`
                    }
                }
            },
            async keywordChanged(word: any) {
                if (word.length>1) {
                    const fetchedKeywords = await api.searchKeywords(word);
                    this.searchKeywords = _.uniqBy(fetchedKeywords.concat(this.selectedKeywords), 'id');
                }
            },
            loadMovies: async function(updateUrl: boolean) {
                this.computeQuery(updateUrl);
                this.currentPage = 1;
                if (this.isMovies) {
                    this.queryData = await api.getDiscoverMoviesFull(this.computedDiscoverQuery);
                    this.movies = this.queryData.results;
                    await this.loadMoreMovies();
                } else {
                    this.queryData = await api.getDiscoverSeries(this.computedDiscoverQuery);
                    this.movies = this.queryData.results;
                    await this.loadMoreMovies();
                }
                this.isLoaded = true;
            },
            fetchMoreMovies: async function() {
                this.currentPage++;
                let currentdiscoverQuery = this.computedDiscoverQuery;
                currentdiscoverQuery += `&page=${this.currentPage}`;
                let queryResult;
                if (this.isMovies) {
                    queryResult = await api.getDiscoverMoviesFull(currentdiscoverQuery);
                } else {
                    queryResult = await api.getDiscoverSeries(currentdiscoverQuery);
                }
                this.movies = this.movies.concat(queryResult.results);
                this.isLoaded = true;
                this.isDataLoading = false;
            },
            loadMoreMovies: _.debounce(async function(this: any) {
                this.isDataLoading = true;
                for (let count = 1; count < 3; count++) {
                    await this.fetchMoreMovies();
                }
            }, 200),
            computeQuery(updateUrl: boolean) {
                this.currentPage = 1;
                let isAnyGenreAdded = false;
                this.computedDiscoverQuery = '';

                const routerQuery = {} as any;
                if (this.selectedSortOrder) {
                    this.computedDiscoverQuery += `&sort_by=${this.selectedSortOrder.id}`;
                    routerQuery.sort_by = this.selectedSortOrder.id;
                }
                if (this.selectedGenres.length) {
                    const selectedGenreIds = this.selectedGenres.map(({id}) => id);
                    this.computedDiscoverQuery += `&with_genres=${selectedGenreIds}`;
                    routerQuery.with_genres = selectedGenreIds.toString();
                }
                if (this.selectedKeywords.length) {
                    const keywordIds = this.selectedKeywords.map(({id}) => id).toString();
                    const keywords = this.selectedKeywords.map(({name}) => name).toString();
                    this.computedDiscoverQuery += `&with_keywords=${keywordIds}`;
                    routerQuery.with_keywords = keywordIds.toString();
                    routerQuery.keywords = keywords.toString();
                }
                if (this.selectedRating.id) {
                    this.computedDiscoverQuery += `&vote_average.gte=${this.selectedRating.id}`;
                    routerQuery.rating = this.selectedRating.id;
                }
                routerQuery.isMovies = this.isMovies;
                if (updateUrl) {
                    this.$router.push({
                        name: 'discover',
                        query: routerQuery,
                        replace: this.routeQueryPresent
                    }).catch(err => {});
                }
            },
            typeChanged() {
                this.selectedGenres = [];
                if (this.isMovies) {
                    this.genres = this.movieGenres;
                } else {
                    this.genres = this.seriesGenres;
                }
            }
        },
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';

    .discover-movies-container {
        padding: 1em 2.5em;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
    }
    /deep/ .movie-item {
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
    .loader-main {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 100%;
        height: 4em;
        display: flex;
        justify-content: center;
        background-repeat: no-repeat;
        background-position: 50% 50%;
    }
    .input-label {
        font-weight: 400;
        margin-right: 1em;
        text-transform: capitalize;
    }
    .search-btn {
        background-color: @main-red !important;
        filter: opacity(0.95);
        border-color: #222;
    }
    .discover-options-row {
        background: @background-gray;
    }
    .full-width {
        width: 100%;
    }
</style>
