<template>
    <div>
        <div class="mt-5 ml-5">
            <el-row>
                <el-col :span="4">
                    keyword 
                    <el-select v-model="selectedKeywords" multiple filterable remote
                        :remote-method="keywordChanged" placeholder="Select"
                        :no-data-text="'No Results'" value-key="id">
                        <el-option
                            v-for="item in searchKeywords"
                            :key="item.id"
                            :label="item.name"
                            :value="item">
                        </el-option>
                    </el-select>
                </el-col>
                <el-col :span="2">
                    <el-button @click="searchWithKeywords">Search</el-button>
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
            'clearDiscoveryData',
            'isMovies',
            'showFullMovieInfo',
        ],
        data() {
          return {
              isLoaded: false,
              isDataLoading: true,
              movies: [] as any[],
              queryData: {
                  results: []
              },
              currentPage: 1,
              selectedMovie: {},
              computedDiscoverQuery: '',
              selectedKeywords: [],
              searchKeywords: [],
          }  
        },
        created() {
            this.computeQuery(this.queryParams);
            if (this.$route.query.keywords) {
                this.searchWithKeywords();
            }
            this.loadMovies();
            const self = this;
            window.onscroll = function() {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
                   self.loadMoreMovies();
                }
            };
        },
        methods: {
            async keywordChanged(word: any) {
                if (word.length>1) {
                    this.searchKeywords = await api.searchKeywords(word);
                }
            },
            async searchWithKeywords() {
                this.currentPage = 1;
                let keyWordIds = '';
                if (this.selectedKeywords.length > 0) {
                    keyWordIds = this.selectedKeywords.map(({id}) => id).toString();
                } else if (this.$route.query.keywords) {
                    keyWordIds = `${this.$route.query.keywords}`;
                }
                this.computedDiscoverQuery = `&with_keywords=${keyWordIds}`;
                this.$router.push({
                    name: 'discover',
                    query: {
                        keywords: keyWordIds.toString()
                    }
                }).catch(err => {});
                this.queryData = await api.getDiscoverMoviesFull(this.computedDiscoverQuery);
                this.movies = this.queryData.results;
                this.fetchMoreMovies();
            },
            loadMovies: async function() {
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
            closeInfo() {
                $('#movieInfoModal').modal('hide');
            },
            computeQuery(newQueryParams: any) {
                this.currentPage = 1;
                let isAnyGenreAdded = false;
                this.computedDiscoverQuery = '';
                if (this.isMovies) {
                    if (newQueryParams.sortOrder) {
                        this.computedDiscoverQuery += `&sort_by=${movieParams.SORT_ORDER[newQueryParams.sortOrder]}`;
                    }
                    if (newQueryParams.minDate || newQueryParams.maxDate) {
                        this.computedDiscoverQuery += `&primary_release_date.gte=${newQueryParams.minDate}`;
                        this.computedDiscoverQuery += `&primary_release_date.lte=${newQueryParams.maxDate}`;
                    } else if (newQueryParams.selectedYear) {
                        this.computedDiscoverQuery += `&primary_release_year=${newQueryParams.selectedYear}`;
                    }
                    _.each(newQueryParams.selectedGenreMap,
                        (isSelected, genreId) => {
                            if (isSelected && !isAnyGenreAdded) {
                                this.computedDiscoverQuery += `&with_genres=${genreId},`;
                                isAnyGenreAdded = true;
                            } else if (isSelected) {
                                this.computedDiscoverQuery += `${genreId},`;
                            }
                        }
                    );
                    if (this.computedDiscoverQuery === '') {
                        this.computedDiscoverQuery += `&sort_by=popularity.desc`;
                    }
                } else {
                    if (newQueryParams.sortOrder) {
                        this.computedDiscoverQuery += `&sort_by=${seriesParams.SORT_ORDER[newQueryParams.sortOrder]}`;
                    }
                    if (newQueryParams.minDate || newQueryParams.maxDate) {
                        this.computedDiscoverQuery += `&first_air_date.gte=${newQueryParams.minDate}`;
                        this.computedDiscoverQuery += `&first_air_date.lte=${newQueryParams.maxDate}`;
                    } else if (newQueryParams.selectedYear) {
                        this.computedDiscoverQuery += `&first_air_date_year=${newQueryParams.selectedYear}`;
                    }
                    _.each(newQueryParams.selectedGenreMap,
                        (isSelected, genreId) => {
                            if (isSelected && !isAnyGenreAdded) {
                                this.computedDiscoverQuery += `&with_genres=${genreId},`;
                                isAnyGenreAdded = true;
                            } else if (isSelected) {
                                this.computedDiscoverQuery += `${genreId},`;
                            }
                        }
                    );
                    if (this.computedDiscoverQuery === '') {
                        this.computedDiscoverQuery += `&sort_by=popularity.desc`;
                    }
                }
                this.loadMovies();
            }
        },
        watch: {
            queryParams: {
                handler (newQueryParams) {
                    this.computeQuery(newQueryParams);
                },
                deep: true
            },
            isMovies: {
                handler () {
                    this.computeQuery(this.queryParams);
                }
            },
            '$route.query': function () {
                console.log(this.$route.query.keywords);
            }
        },
    }
</script>

<style scoped>
    @import '../../Assets/Styles/main.less';

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
    ::v-deep .info-container {
        padding: 0;
        width: 100%;
    }
    .modal-xl {
        max-width: 90%;
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
</style>
