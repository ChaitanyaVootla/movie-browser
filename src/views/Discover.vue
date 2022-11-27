<template>
    <div>
        <div class="content-switch">
            <el-radio-group v-model="isMovies" @change="typeChanged">
                <el-radio-button :label="true">Movies</el-radio-button>
                <el-radio-button :label="false">Series</el-radio-button>
            </el-radio-group>
        </div>
        <div class="pt-2 pl-5 pr-5 pb-2 discover-options-row">
            <el-select
                v-model="selectedSortOrder"
                value-key="id"
                placeholder="Sort By"
                class="full-width"
                @change="loadMovies(true)"
            >
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
                @change="loadMovies(true)"
            >
                <el-option v-for="item in genres" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select
                v-model="selectedKeywords"
                multiple
                filterable
                remote
                :collapse-tags="true"
                :remote-method="keywordChanged"
                placeholder="Looking for anything specific?"
                :no-data-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
                @change="loadMovies(true)"
            >
                <el-option v-for="item in searchKeywords" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select
                v-model="selectedPeople"
                multiple
                filterable
                remote
                :collapse-tags="true"
                :remote-method="peopleSearchChanged"
                placeholder="Cast"
                :no-data-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
                @change="loadMovies(true)"
                :disabled="!isMovies"
            >
                <el-option
                    v-for="result in searchPeople"
                    :key="result.id"
                    :label="result.name"
                    :value="result"
                    class="person-dropdown"
                >
                    <div style="display: flex; width: 30em">
                        <img
                            v-lazy="{
                                src: `${configuration.images.base_url}w500${result.profile_path}`,
                            }"
                            class="search-image"
                        />
                        <div class="search-info-container ml-3">
                            <span>
                                {{ result.name }}
                            </span>
                            <div class="mt-4">
                                {{ result.known_for_department }}<br />
                                <div class="text-muted" style="font-size: 0.9em; display: inline-flex; flex-wrap: wrap">
                                    <span v-for="(content, index) in result.known_for" :key="index">
                                        {{ content.original_title || content.original_name }},
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </el-option>
            </el-select>
            <el-select
                v-model="selectedRating"
                value-key="id"
                clearable
                placeholder="Rating"
                class="full-width"
                @change="loadMovies(true)"
            >
                <el-option v-for="item in ratingOptions" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
        </div>
        <div
            class="pt-2 pl-5 pr-5 pb-2 discover-options-row advanced-options-row mobile-hide"
            v-show="showAdvancedFilters"
        >
            <el-select
                v-model="selectedCertification"
                value-key="certification"
                clearable
                placeholder="Certification"
                @change="loadMovies(true)"
                class="full-width"
            >
                <el-option
                    v-for="item in certifications['US']"
                    :key="item.certification"
                    :label="item.certification"
                    :value="item"
                >
                </el-option>
            </el-select>
            <el-select
                v-model="selectedGenresToExclude"
                multiple
                filterable
                :collapse-tags="true"
                placeholder="Exclude Genres"
                :no-match-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
                @change="loadMovies(true)"
            >
                <el-option v-for="item in genres" :key="item.id" :label="item.name" :value="item"> </el-option>
            </el-select>
            <el-select
                v-model="selectedTimeFrame"
                filterable
                :collapse-tags="true"
                placeholder="Release Date"
                :no-data-text="'No Results'"
                value-key="name"
                class="full-width"
                clearable
                @change="loadMovies(true)"
            >
                <el-option-group label="Time Frames">
                    <el-option v-for="item in timeFrames" :key="item.name" :label="item.name" :value="item">
                    </el-option>
                </el-option-group>
                <el-option-group label="Year">
                    <el-option v-for="item in allYears" :key="item.name" :label="item.name" :value="item"> </el-option>
                </el-option-group>
            </el-select>
            <el-select
                v-model="selectedPeople"
                multiple
                filterable
                remote
                :collapse-tags="true"
                :remote-method="peopleSearchChanged"
                placeholder="Crew"
                :no-data-text="'No Results'"
                value-key="id"
                class="full-width"
                clearable
                @change="loadMovies(true)"
                :disabled="!isMovies"
            >
                <el-option
                    v-for="result in searchPeople"
                    :key="result.id"
                    :label="result.name"
                    :value="result"
                    class="person-dropdown"
                >
                    <div style="display: flex; width: 30em">
                        <img
                            v-lazy="{
                                src: `${configuration.images.base_url}w500${result.profile_path}`,
                            }"
                            class="search-image"
                        />
                        <div class="search-info-container ml-3">
                            <span>
                                {{ result.name }}
                            </span>
                            <div class="mt-4">
                                {{ result.known_for_department }}<br />
                                <div class="text-muted" style="font-size: 0.9em; display: inline-flex; flex-wrap: wrap">
                                    <span v-for="(content, index) in result.known_for" :key="index">
                                        {{ content.original_title || content.original_name }},
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </el-option>
            </el-select>
            <el-input placeholder="Min Votes" v-model="minVotes" @change="loadMovies(true)" clearable></el-input>
        </div>
        <div class="pl-5 pt-2 pb-2 favorites-bar mobile-hide">
            <div class="pr-3 pt-2"> <i class="fa-solid fa-star mr-2"></i> Saved Filters </div>
            <div v-if="savedFilters.length">
                <router-link
                    v-for="savedFilter in savedFilters"
                    :key="savedFilter.name"
                    class="mr-3"
                    :to="{
                        name: 'discover',
                        query: {
                            ...savedFilter,
                        },
                    }"
                >
                    <el-button
                        @click="filterClicked"
                        :type="$router.currentRoute.query.name === savedFilter.name ? 'danger' : 'primary'"
                    >
                        {{ savedFilter.name }}
                    </el-button>
                </router-link>
            </div>
            <div class="right-action-items">
                <el-alert v-if="!savedFilters.length" type="info" :closable="false">
                    You don't have any saved filters, you can create one by choosing filters above and saving it here
                    <i class="fa-solid fa-arrow-right mr-2"></i>
                </el-alert>
                <div class="ml-3 mobile-hide save-container">
                    <el-button-group v-if="isSavedFilterView">
                        <el-button type="primary" @click="saveFilter" icon="el-icon-star-on"> Update Filter </el-button>
                        <el-tooltip
                            class="item"
                            effect="light"
                            content="Clear Filter"
                            placement="bottom"
                            v-if="isSavedFilterView"
                        >
                            <el-button @click="clearFilter" icon="el-icon-circle-close"> </el-button>
                        </el-tooltip>
                        <el-tooltip class="item" effect="light" content="Delete Filter" placement="bottom">
                            <el-button @click="deleteClicked" type="danger" icon="el-icon-delete"> </el-button>
                        </el-tooltip>
                    </el-button-group>
                    <el-button
                        type="primary"
                        @click="
                            saveFilterDialogVisible = true;
                            filterName = '';
                        "
                        icon="el-icon-star-off"
                        v-else
                    >
                        Save Filter
                    </el-button>
                </div>
                <div class="ml-3">
                    <el-button @click="shareClicked" plain type="info" icon="el-icon-share">Share</el-button>
                </div>
            </div>
        </div>
        <div class="query-info text-muted" style="display: flex; justify-content: space-between">
            <div class="">
                {{ queryData.total_results === 10000 ? `${queryData.total_results}+` : queryData.total_results }}
                results
                <el-tooltip effect="light" content="including watched movies" placement="right">
                    <i class="fa-solid fa-circle-info ml-1" v-show="hideWatchedMovies"></i>
                </el-tooltip>
                <!-- <el-button @click="toggleGallery">
                    Gallery
                </el-button> -->
            </div>
            <div style="display: flex">
                <div class="ml-3 mt-2 save-container mobile-hide">
                    <el-checkbox v-model="hideWatcListMovies" @change="loadMovies(true)">Hide Watch list</el-checkbox>
                </div>
                <div class="ml-3 mt-2 save-container mobile-hide">
                    <el-checkbox v-model="hideWatchedMovies" @change="loadMovies(true)">Hide Watched</el-checkbox>
                </div>
            </div>
        </div>
        <div v-if="isLoaded && !showGallery" class="movies-grid-container">
            <movie-card
                v-for="movie in movies"
                :movie="movie"
                :configuration="configuration"
                :imageRes="'w500'"
                :onSelected="showMovieInfo"
                :key="movie.id"
                :showFullMovieInfo="showFullMovieInfo"
                :hideWatched="hideWatchedMovies"
                :hideWatchList="hideWatcListMovies"
            >
            </movie-card>
        </div>
        <div v-else-if="showGallery" class="imageGallery">
            <img
                v-for="image in images"
                :key="image.file_path"
                v-lazy="{ src: configuration.images.secure_base_url + 'w300' + image.file_path }"
                class=""
            />
        </div>
        <div class="grid-center" v-if="!hideLoadMore">
            <el-button @click="loadMoreMovies">Load More</el-button>
        </div>
        <div class="loader-main" v-if="isDataLoading"></div>
        <el-dialog
            :title="$router.currentRoute.query.name ? 'Delete Search' : 'Save Search'"
            :visible.sync="saveFilterDialogVisible"
            width="30%"
        >
            <el-input placeholder="Name" v-model="filterName"></el-input>
            <span slot="footer" class="dialog-footer">
                <el-button
                    @click="deleteFilter"
                    :disabled="!filterName.length"
                    type="danger"
                    v-if="$router.currentRoute.query.name"
                    >Delete</el-button
                >
                <el-button @click="saveFilter" :disabled="!filterName.length" type="success" v-else>Save</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { find, uniqBy, sortBy } from 'lodash';
import { certifications } from '@/common/certifications';
import moment from 'moment';
import Vue from 'vue';

export default Vue.extend({
    name: 'movieDiscover',
    props: [
        'configuration',
        'imageBasePath',
        'queryParams',
        'showMovieInfo',
        'showFullMovieInfo',
        'movieGenres',
        'seriesGenres',
    ],
    data() {
        return {
            certifications,
            isLoaded: false,
            showGallery: false,
            isDataLoading: true,
            movies: [] as any[],
            showAdvancedFilters: true,
            hideWatchedMovies: false,
            hideWatcListMovies: false,
            saveFilterDialogVisible: false,
            filterName: '',
            queryData: {
                results: [],
            } as any,
            sortOrders: [
                {
                    name: 'Popularity',
                    id: 'popularity.desc',
                },
                {
                    name: 'Rating',
                    id: 'vote_average.desc',
                },
                {
                    name: 'Revenue',
                    id: 'revenue.desc',
                },
                {
                    name: 'Oldest',
                    id: 'primary_release_date.asc',
                },
                {
                    name: 'Newest',
                    id: 'primary_release_date.desc',
                },
            ],
            currentPage: 1,
            minVotes: null,
            isMovies: true,
            computedDiscoverQuery: '',
            selectedTimeFrame: null,
            images: [],
            ratingOptions: [] as any[],
            selectedRating: {} as any,
            selectedKeywords: [] as any[],
            selectedPeople: [] as any[],
            searchKeywords: [] as any[],
            searchPeople: [] as any[],
            genres: [] as any[],
            selectedGenres: [] as any[],
            selectedGenresToExclude: [] as any[],
            timeFrames: [] as any[],
            allYears: [] as any[],
            dateRange: {},
            isSavedFilterView: false,
            selectedSortOrder: {
                name: 'Popularity',
                id: 'popularity.desc',
            },
            selectedCertification: {},
            routeQueryPresent: false,
        };
    },
    beforeDestroy() {
        window.removeEventListener('scroll', this.scrollHandler);
    },
    created() {
        this.setupRatingOptions();
        this.setupTimeFrameOptions();
        this.genres = this.movieGenres;
        this.checkRouteQuery();
        if (this.$router.currentRoute.query.name) {
            this.isSavedFilterView = true;
        } else {
            this.isSavedFilterView = false;
        }
        this.loadMovies(false);
        window.addEventListener('scroll', this.scrollHandler);
    },
    watch: {
        $route(to, from) {
            this.currentPage = 1;
            this.checkRouteQuery();
            if (this.$router.currentRoute.query.name) {
                this.isSavedFilterView = true;
            } else {
                this.isSavedFilterView = false;
            }
        },
    },
    computed: {
        savedFilters() {
            return sortBy(this.$store.getters.savedFilters, 'name');
        },
        hideLoadMore() {
            return this.queryData.total_pages < this.currentPage - 1;
        },
    },
    methods: {
        async toggleGallery() {
            this.showGallery = !this.showGallery;
            if (this.showGallery) {
                const idsToFetchImages = this.movies
                    .map(({ id, backdrop_path }) => {
                        if (backdrop_path) {
                            return id;
                        }
                    })
                    .filter(Boolean)
                    .slice(0, 7);
                console.log(idsToFetchImages);
                const allBackdrops = [];
                for (let movieId of idsToFetchImages) {
                    const { backdrops }: { backdrops: any[] } = await api.getMovieImages(movieId);
                    allBackdrops.push(...backdrops);
                }
                this.images = allBackdrops;
            }
        },
        shareClicked() {
            navigator.clipboard.writeText(window.location.href);
            this.$message({
                message: 'Link copied to clipboard',
                center: true,
                type: 'success',
            });
        },
        filterClicked() {
            setTimeout(() => {
                this.loadMovies(true);
            }, 10);
        },
        clearFilter() {
            this.$router
                .push({
                    name: 'discover',
                })
                .catch((err) => {});
            setTimeout(() => {
                this.loadMovies(true);
            });
        },
        async saveFilter() {
            await api.createOrUpdateFilter({
                ...this.$router.currentRoute.query,
                name: this.filterName || this.$router.currentRoute.query.name,
            });
            this.$router.currentRoute.query.name = this.filterName || this.$router.currentRoute.query.name;
            this.saveFilterDialogVisible = false;
            this.$message({
                message: 'Filter Saved',
                center: true,
                type: 'success',
            });
            this.$store.dispatch('updateFilters');
        },
        async deleteFilter() {
            await api.deleteFilter(this.$router.currentRoute.query.name);
            this.saveFilterDialogVisible = false;
            this.$message({
                message: 'Filter Deleted',
                center: true,
                type: 'success',
            });
            this.$router
                .push({
                    name: 'discover',
                })
                .catch((err) => {});
            this.$store.dispatch('updateFilters');
            // setTimeout(() => {
            //     this.loadMovies(true);
            // });
        },
        scrollHandler() {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
                this.loadMoreMovies();
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
        setupTimeFrameOptions() {
            const currentData = new Date();
            const allYears = [];
            for (let year = 1874; year <= currentData.getFullYear(); year++) {
                allYears.push({
                    name: year,
                });
            }
            this.allYears = allYears.reverse();
            this.timeFrames.push({
                name: 'Upcoming',
                endDate: moment().format('YYYY-MM-DD'),
            });
            this.timeFrames.push({
                name: 'Recent',
                startDate: null,
                endDate: '2010-01-01',
            });
            this.timeFrames.push({
                name: '2000s',
                startDate: '2010-01-01',
                endDate: '2000-01-01',
            });
            this.timeFrames.push({
                name: '90s',
                startDate: '2000-01-01',
                endDate: '1990-01-01',
            });
            this.timeFrames.push({
                name: '80s',
                startDate: '1990-01-01',
                endDate: '1980-01-01',
            });
            this.timeFrames.push({
                name: '70s',
                startDate: '1980-01-01',
                endDate: '1970-01-01',
            });
            this.timeFrames.push({
                name: 'Vintage',
                startDate: '1970-01-01',
                endDate: null,
            });
        },
        checkRouteQuery() {
            const routeQuery = this.$route.query;
            this.selectedSortOrder = {
                name: 'Popularity',
                id: 'popularity.desc',
            };
            if (routeQuery.sort_by) {
                this.routeQueryPresent = true;
                if (routeQuery.sort_by === 'vote_average.desc') {
                    this.selectedSortOrder = {
                        name: 'Rating',
                        id: 'vote_average.desc',
                    };
                } else if (routeQuery.sort_by === 'revenue.desc') {
                    this.selectedSortOrder = {
                        name: 'Revenue',
                        id: 'revenue.desc',
                    };
                } else if (routeQuery.sort_by === 'primary_release_date.asc') {
                    this.selectedSortOrder = {
                        name: 'Oldest',
                        id: 'primary_release_date.asc',
                    };
                } else if (routeQuery.sort_by === 'primary_release_date.desc') {
                    this.selectedSortOrder = {
                        name: 'Revenue',
                        id: 'primary_release_date.desc',
                    };
                }
            }
            this.selectedGenres = [];
            if (routeQuery.with_genres) {
                const genreIds = `${routeQuery.with_genres}`.split(',');
                const allGenres = this.movieGenres.concat(this.seriesGenres);
                genreIds.forEach((id) => {
                    const genre = find(allGenres, { id: parseInt(id) });
                    this.selectedGenres.push(genre);
                });
            }
            this.selectedKeywords = [];
            if (routeQuery.with_keywords && routeQuery.keywords) {
                const keywordIds = `${routeQuery.with_keywords}`.split(',');
                const keywords = `${routeQuery.keywords}`.split(',');
                keywordIds.forEach((id, index) => {
                    this.selectedKeywords.push({
                        id: parseInt(id),
                        name: keywords[index],
                    });
                });
                this.selectedKeywords = uniqBy(this.selectedKeywords, 'id');
                this.searchKeywords = this.selectedKeywords;
            }
            this.selectedPeople = [];
            if (routeQuery.with_people) {
                const peopleIds = `${routeQuery.with_people}`.split(',');
                const people = `${routeQuery.people}`.split(',');
                peopleIds.forEach((id, index) => {
                    this.selectedPeople.push({
                        id: parseInt(id),
                        name: people[index],
                    });
                });
                this.selectedPeople = uniqBy(this.selectedPeople, 'id');
                this.searchPeople = this.selectedPeople;
            }
            this.isMovies = true;
            if (routeQuery.isMovies == 'false' || routeQuery.isMovies === false) {
                this.isMovies = false;
                this.genres = this.seriesGenres;
            }
            this.selectedRating = {};
            if (routeQuery.rating) {
                this.selectedRating = {
                    id: parseInt(`${routeQuery.rating}`),
                    name: `${routeQuery.rating}+`,
                };
            }
            // Advanced filters
            // this.showAdvancedFilters = false;
            this.showAdvancedFilters = true;
            this.selectedGenresToExclude = [];
            if (routeQuery.without_genres) {
                const genreIds = `${routeQuery.without_genres}`.split(',');
                const allGenres = this.movieGenres.concat(this.seriesGenres);
                genreIds.forEach((id) => {
                    const genre = find(allGenres, { id: parseInt(id) });
                    this.selectedGenresToExclude.push(genre);
                });
                this.showAdvancedFilters = true;
            }
            this.selectedTimeFrame = {};
            if (routeQuery.releaseQueryName) {
                this.selectedTimeFrame.name = routeQuery.releaseQueryName;
                if (!this.timeFrames.map(({ name }) => name).includes(this.selectedTimeFrame.name)) {
                    this.selectedTimeFrame.name = parseInt(this.selectedTimeFrame.name);
                }
                if (routeQuery['primary_release_date.lte']) {
                    this.selectedTimeFrame.startDate = routeQuery['primary_release_date.lte'];
                }
                if (routeQuery['primary_release_date.gte']) {
                    this.selectedTimeFrame.endDate = routeQuery['primary_release_date.gte'];
                }
                if (routeQuery['first_air_date.lte']) {
                    this.selectedTimeFrame.startDate = routeQuery['first_air_date.lte'];
                }
                if (routeQuery['first_air_date.gte']) {
                    this.selectedTimeFrame.endDate = routeQuery['first_air_date.gte'];
                }
                this.showAdvancedFilters = true;
            }
            this.minVotes = null;
            if (routeQuery['vote_count.gte']) {
                this.minVotes = routeQuery['vote_count.gte'];
                this.showAdvancedFilters = true;
            }
            this.selectedCertification = {};
            if (routeQuery.certification) {
                this.selectedCertification = {
                    certification: routeQuery.certification,
                };
                this.showAdvancedFilters = true;
            }
            this.hideWatchedMovies = false;
            if (routeQuery.hideWatchedMovies) {
                this.hideWatchedMovies = true;
                this.showAdvancedFilters = true;
            }
        },
        async keywordChanged(word: any) {
            if (word.length > 1) {
                const fetchedKeywords = await api.searchKeywords(word);
                this.searchKeywords = uniqBy(fetchedKeywords.concat(this.selectedKeywords), 'id');
            }
        },
        async peopleSearchChanged(word: any) {
            if (word.length > 1) {
                const peopleResults = await api.searchPeople(word);
                this.searchPeople = peopleResults.results;
            }
        },
        loadMovies: async function (updateUrl: boolean) {
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
        fetchMoreMovies: async function () {
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
        loadMoreMovies: async function (this: any) {
            if (this.queryData.total_pages < this.currentPage - 1) {
                return;
            }
            this.isDataLoading = true;
            for (let count = 1; count < 4; count++) {
                await this.fetchMoreMovies();
            }
        },
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
                const selectedGenreIds = this.selectedGenres.map(({ id }) => id);
                this.computedDiscoverQuery += `&with_genres=${selectedGenreIds}`;
                routerQuery.with_genres = selectedGenreIds.toString();
            }
            if (this.selectedGenresToExclude.length) {
                const selectedExcludeGenreIds = this.selectedGenresToExclude.map(({ id }) => id);
                this.computedDiscoverQuery += `&without_genres=${selectedExcludeGenreIds}`;
                routerQuery.without_genres = selectedExcludeGenreIds.toString();
            }
            if (this.selectedTimeFrame && this.selectedTimeFrame.name) {
                if (this.selectedTimeFrame.startDate || this.selectedTimeFrame.endDate) {
                    if (this.selectedTimeFrame.startDate) {
                        if (this.isMovies) {
                            this.computedDiscoverQuery += `&primary_release_date.lte=${this.selectedTimeFrame.startDate}`;
                            routerQuery['primary_release_date.lte'] = this.selectedTimeFrame.startDate;
                        } else {
                            this.computedDiscoverQuery += `&first_air_date.lte=${this.selectedTimeFrame.startDate}`;
                            routerQuery['first_air_date.lte'] = this.selectedTimeFrame.startDate;
                        }
                    }
                    if (this.selectedTimeFrame.endDate) {
                        if (this.isMovies) {
                            this.computedDiscoverQuery += `&primary_release_date.gte=${this.selectedTimeFrame.endDate}`;
                            routerQuery['primary_release_date.gte'] = this.selectedTimeFrame.endDate;
                        } else {
                            this.computedDiscoverQuery += `&first_air_date.gte=${this.selectedTimeFrame.endDate}`;
                            routerQuery['first_air_date.gte'] = this.selectedTimeFrame.endDate;
                        }
                    }
                } else {
                    this.computedDiscoverQuery += `&primary_release_year=${this.selectedTimeFrame.name}`;
                    routerQuery['primary_release_year'] = this.selectedTimeFrame.name;
                }
                routerQuery['releaseQueryName'] = this.selectedTimeFrame.name;
            }
            if (this.minVotes) {
                this.computedDiscoverQuery += `&vote_count.gte=${this.minVotes}`;
                routerQuery['vote_count.gte'] = this.minVotes;
            }
            if (this.hideWatchedMovies) {
                routerQuery.hideWatchedMovies = true;
            }
            if (this.selectedKeywords.length) {
                const keywordIds = this.selectedKeywords.map(({ id }) => id);
                const keywords = this.selectedKeywords.map(({ name }) => name).toString();
                this.computedDiscoverQuery += `&with_keywords=${keywordIds.join('|')}`;
                routerQuery.with_keywords = keywordIds.toString();
                routerQuery.keywords = keywords.toString();
            }
            if (this.selectedPeople.length) {
                const peopleIds = this.selectedPeople.map(({ id }) => id);
                const people = this.selectedPeople.map(({ name }) => name).toString();
                this.computedDiscoverQuery += `&with_people=${peopleIds.join('|')}`;
                routerQuery.with_people = peopleIds.toString();
                routerQuery.people = people.toString();
            }
            if (this.selectedRating.id) {
                this.computedDiscoverQuery += `&vote_average.gte=${this.selectedRating.id}`;
                routerQuery.rating = this.selectedRating.id;
            }
            if (this.selectedCertification.certification) {
                this.computedDiscoverQuery += `&certification_country=US&certification=${this.selectedCertification.certification}`;
                routerQuery.certification = this.selectedCertification.certification;
            }
            routerQuery.isMovies = this.isMovies;
            if (updateUrl) {
                this.$router
                    .push({
                        name: 'discover',
                        query: {
                            ...routerQuery,
                            name: this.$router.currentRoute.query.name,
                        },
                        replace: this.routeQueryPresent,
                    })
                    .catch((err) => {});
            }
        },
        typeChanged() {
            this.selectedGenres = [];
            if (this.isMovies) {
                this.genres = this.movieGenres;
            } else {
                this.genres = this.seriesGenres;
            }
            this.loadMovies(true);
        },
        deleteClicked() {
            this.saveFilterDialogVisible = true;
            this.filterName = this.$router.currentRoute.query.name as string;
        },
    },
});
</script>

<style scoped lang="less">
@import '../Assets/Styles/main.less';

.imageGallery {
    display: flex;
    flex-wrap: wrap;
    gap: 3vw;
    margin: 5vw;
    img {
        width: 40vw;
    }
}
.person-dropdown {
    height: auto !important;
    padding: 1em;
}
.search-image[lazy='error'] {
    background-size: 4em;
    padding: 2em;
    width: 7em;
}
.search-image[lazy='loading'] {
    background-size: contain;
    padding: 2em;
    width: 7em;
}
.search-image {
    height: 10em;
    border-radius: 3px;
}
.search-info-container {
    display: flex;
    flex-direction: column;
}
.movies-grid-container {
    padding-left: 3em;
    padding-right: 3em;
}
.small-filter {
    width: 60%;
}
.info-text {
    line-height: 2.5rem;
}
.content-switch {
    display: flex;
    justify-content: center;
    padding-top: 1em;
    background: @background-gray;
}
.favorites-bar {
    display: flex;
    justify-content: space-between;
    .right-action-items {
        display: flex;
        padding-right: 3rem;
    }
}
.grid-center {
    display: grid;
    place-items: center;
}
.query-info {
    padding: 1em 3em 0 3em;
    font-weight: 500;
    display: flex;
}
.back-icon {
    color: bisque;
}
.loader-main {
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
    display: flex;
    gap: 1rem;
}
.advanced-options-row {
    margin-top: 0;
    grid-template-columns: 0.6fr 1fr 1fr 0.6fr 1fr 0.6fr 0.5fr 0.8fr;
}
@media (max-width: 767px) {
    .query-info {
        padding: 0.5em;
    }
    .discover-options-row {
        display: flex;
        padding: 0 0.5em !important;
        gap: 0;
        > div {
            flex: 0 50%;
        }
    }
    .full-width {
        width: 50%;
    }
    .switch-container {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: center;
        justify-items: center;
        align-content: center;
        justify-content: center;
    }
    .movie-card-image {
        height: 10em;
    }
}
.switch-container {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    align-content: center;
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5em;
    margin-right: 1em;
}
.save-container {
    display: flex;
    justify-content: center;
}
.full-width {
    width: 100%;
}
.advanced-filters {
    fill: #eee;
    cursor: pointer;
}
</style>
