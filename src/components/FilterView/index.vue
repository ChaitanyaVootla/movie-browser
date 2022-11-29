<template>
    <div v-if="selectedFilter.name">
        <mb-slider
            :items="movies"
            :configuration="configuration"
            :id="'FilterView'"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
            :history="true"
            :hideWatched="hideWatchedMovies"
            :heading="`${selectedFilter.name} - Your filters`"
            :externalLink="{
                name: 'discover',
                query: {
                    ...selectedFilter,
                },
            }"
        ></mb-slider>
    </div>
</template>

<script lang="ts">
import { find, uniqBy } from 'lodash';
import { api } from '@/API/api';
import MbSlider from '@/components/Slider/index.vue';

export default {
    name: 'FilterView',
    props: [
        'configuration',
        'imageBasePath',
        'queryParams',
        'showMovieInfo',
        'showFullMovieInfo',
        'movieGenres',
        'seriesGenres',
        'uuid',
    ],
    components: {
        MbSlider,
    },
    data() {
        return {
            computedDiscoverQuery: '',
            movies: [],
            hideWatchedMovies: false,
        };
    },
    computed: {
        selectedFilter() {
            const randomFilter = this.$store.getters.randomFilter(`${this.uuid}`);
            if (randomFilter?.name) {
                this.parseFilter(randomFilter);
                this.computeQuery();
                this.loadMovies();
                this.fetchMoreMovies();
                this.fetchMoreMovies();
            }
            return randomFilter;
        },
        filteredMovies() {
            if (this.hideWatchedMovies) {
                return this.movies.filter((movie) => !movie.watched);
            }
        },
    },
    methods: {
        parseFilter(filter) {
            const routeQuery = filter;
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
        computeQuery() {
            this.currentPage = 1;
            this.computedDiscoverQuery = '';

            if (this.selectedSortOrder) {
                this.computedDiscoverQuery += `&sort_by=${this.selectedSortOrder.id}`;
            }
            if (this.selectedGenres.length) {
                const selectedGenreIds = this.selectedGenres.map(({ id }) => id);
                this.computedDiscoverQuery += `&with_genres=${selectedGenreIds}`;
            }
            if (this.selectedGenresToExclude.length) {
                const selectedExcludeGenreIds = this.selectedGenresToExclude.map(({ id }) => id);
                this.computedDiscoverQuery += `&without_genres=${selectedExcludeGenreIds}`;
            }
            if (this.selectedTimeFrame && this.selectedTimeFrame.name) {
                if (this.selectedTimeFrame.startDate || this.selectedTimeFrame.endDate) {
                    if (this.selectedTimeFrame.startDate) {
                        this.computedDiscoverQuery += `&primary_release_date.lte=${this.selectedTimeFrame.startDate}`;
                    }
                    if (this.selectedTimeFrame.endDate) {
                        this.computedDiscoverQuery += `&primary_release_date.gte=${this.selectedTimeFrame.endDate}`;
                    }
                } else {
                    this.computedDiscoverQuery += `&primary_release_year=${this.selectedTimeFrame.name}`;
                }
            }
            if (this.minVotes) {
                this.computedDiscoverQuery += `&vote_count.gte=${this.minVotes}`;
            }
            if (this.selectedKeywords.length) {
                const keywordIds = this.selectedKeywords.map(({ id }) => id);
                const keywords = this.selectedKeywords.map(({ name }) => name).toString();
                this.computedDiscoverQuery += `&with_keywords=${keywordIds.join('|')}`;
            }
            if (this.selectedPeople.length) {
                const peopleIds = this.selectedPeople.map(({ id }) => id);
                const people = this.selectedPeople.map(({ name }) => name).toString();
                this.computedDiscoverQuery += `&with_people=${peopleIds.join('|')}`;
            }
            if (this.selectedRating.id) {
                this.computedDiscoverQuery += `&vote_average.gte=${this.selectedRating.id}`;
            }
            if (this.selectedCertification.certification) {
                this.computedDiscoverQuery += `&certification_country=US&certification=${this.selectedCertification.certification}`;
            }
        },
        loadMovies: async function () {
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
        },
    },
};
</script>

<style lang="less" scoped></style>
