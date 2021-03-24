<template>
    <el-row class="week-trends-container pt-3">
        <el-col :span="watchListAbsent?24:15">
            <el-carousel :height="getCarouselHeight" :interval="7000" :type="watchListAbsent?'card':''" @change="carouselChanged" arrow="always" class="ml-5" id="trending-carousel"
                :key="watchListAbsent">
                <el-carousel-item v-for="item in trendingListWeek" :key="item.id">
                    <div class="carousel-card-container" @click="carouselCardClicked(item)">
                        <div class="background-images-container justify-center">
                            <img v-lazy="{
                                    src: `${configuration.images.secure_base_url}h632${item.backdrop_path}`,
                                    error: require('../../Assets/Images/error.svg'),
                                    loading: require('../../Assets/Images/loader-bars.svg'),
                                }"
                                class="carousel-image"
                            />
                        </div>
                        <div class="info-container" v-if="currentCarouselItem.id === item.id">
                            <h3 div="info-heading">
                                {{item.title || item.name}}
                            </h3>
                            <!-- Genres -->
                            <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                                <span v-for="(genreId, index) in item.genre_ids" :key="genreId">
                                    {{getGenreName(genreId)}}{{index===item.genre_ids.length-1?'':','}}
                                </span>
                                 - {{item.media_type}}
                            </h6>

                            <!-- Rating -->
                            <div class="mt-5 pt-5">
                                <span class="rating-info" :style="`border-color: ${getRatingColor(item.vote_average)}; color: ${getRatingColor(item.vote_average)}`">
                                    {{item.vote_average}}
                                </span>
                            </div>

                            <!-- Item overview -->
                            <div class="movie-overview p-3 mt-10">
                                <span>{{item.overview.slice(0, 200)}}</span>
                            </div>
                        </div>
                    </div>
                </el-carousel-item>
            </el-carousel>
        </el-col>
        <el-col :span="9" class="pr-2 pl-1" v-if="seriesWatchList.length">
            <movie-slider :movies="seriesWatchList" :configuration="configuration" :id="'seriesWatchList'" :showFullMovieInfo="showSeriesInfo"
                v-if="seriesWatchList.length" :history="true" heading="Upcoming Episodes"></movie-slider>
            <div class="m-4 p-3 heading">
                <div class="mb-3">Saved Filters</div>
                <div class="filters-container">
                    <div v-for="savedFilter in savedFilters" :key="savedFilter.name" class="mr-3 mb-3">
                        <router-link :to="{
                            name: 'discover',
                            query: {
                                ...savedFilter,
                                isMovies: true
                            }}">
                            <el-button :type="$router.currentRoute.query.name === savedFilter.name?'danger':'primary'">
                                {{savedFilter.name}}
                            </el-button>
                        </router-link>
                    </div>
                </div>
            </div>
        </el-col>
    </el-row>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { getRatingColor } from '../../Common/utils';
    import { signIn, firebase, signOut, db } from '../../Common/firebase';
    import { sortBy, groupBy, keyBy, uniqBy, compact } from 'lodash';
    import moment from 'moment';

    export default {
        name: 'trendingCarousel',
        props: [
            'configuration',
            'showMovieInfo',
            'showFullMovieInfo',
            'showSeriesInfo',
            'movieGenres',
            'seriesGenres',
            'trendingMovies',
        ],
        data() {
            return {
                getRatingColor,
                trendingListWeek: [],
                currentCarouselItem: {} as any,
                historyLength: 4,
                popularMovies: [],
            }
        },
        mounted() {
            this.loadData();
        },
        computed: {
            getCarouselHeight() {
                return `${window.innerHeight/2}px`;
            },
            savedFilters() {
                return sortBy(this.$store.getters.savedFilters, 'name');
            },
            seriesWatchList() {
                let watchListSeries = this.$store.getters.watchListSeries;
                watchListSeries = compact(watchListSeries.map(
                    series => {
                        if (series.next_episode_to_air) {
                            const nextAirDays = moment({hours: 0}).diff(
                                series.next_episode_to_air.air_date, 'days')*-1;
                            let upcomingText = `In ${nextAirDays} day${nextAirDays > 1?'s':''}`;
                            if (nextAirDays >= 11 || nextAirDays < 0) {
                                upcomingText = moment(series.next_episode_to_air.air_date).format('DD MMM YYYY')
                            } else if (nextAirDays === 0) {
                                upcomingText = 'Today';
                            }
                            series.bottomInfo = `${upcomingText} - S${series.next_episode_to_air.season_number
                                } E${series.next_episode_to_air.episode_number}`;
                            series.upcomingTime = new Date(series.next_episode_to_air.air_date);
                            return series;
                        }
                    }
                ));
                watchListSeries = sortBy(watchListSeries, 'upcomingTime');
                return watchListSeries;
            },
            watchListAbsent() {
                return !this.seriesWatchList.length;
            },
            historyAbsent() {
                return this.historyMovies.length === 0 && this.seriesHistory.length === 0;
            },
            historyMovies() {
                return this.$store.getters.history.movies.slice(0, 4);
            },
            seriesHistory() {
                return this.$store.getters.history.series.slice(0, 4);
            },
        },
        methods: {
            carouselCardClicked(movie: any) {
                if (movie.id === this.currentCarouselItem.id) {
                    this.showFullMovieInfo(movie);
                }
            },
            carouselChanged(currentIndex: number) {
                this.currentCarouselItem = this.trendingListWeek[currentIndex];
            },
            getGenreName(id: any) {
                let genre = this.movieGenres.find(genre => genre.id === id);
                if (!genre) {
                    genre = this.seriesGenres.find(genre => genre.id === id);
                }
                if (genre)
                    return genre.name;
            },
            async getTrendingListWeek() {
                const res = await api.getTrendingListWeek();
                this.trendingListWeek = res.results.slice(0, 10);
                this.currentCarouselItem = this.trendingListWeek[0];
            },
            async loadData() {
                await this.getTrendingListWeek();
                const apiData = await api.getDiscoverMoviesFull('&vote_average.gte=7');
                this.popularMovies = apiData.results;
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .filters-container {
        display: flex;
        flex-wrap: wrap;
    }
    .justify-center {
        display:flex;
        justify-content:center;
    }
    .heading {
        font-size: 17px;
        font-weight: 500;
        padding-left: 2.2em;
        padding-top: 1em;
        padding-bottom: 0.4em;
    }
    .week-trends-container {
        background-color: rgb(24, 24, 24);
        padding-bottom: 1em;
    }
    .carousel-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 10% 0;
    }
    .background-images-container {
        filter: opacity(0.4);
        height: 100%;
        overflow: hidden;
        border-radius: 0.2em;
    }
    .info-container {
        position: absolute;
        top: 2em;
        margin-left: 6em !important;
        overflow: hidden;
        color: #fff;
        width: 80% !important;
        height: 65%;
    }
    .secondary-info {
        color: rgb(228, 228, 228);
    }
    .movie-overview {
        background: @translucent-bg;
        width: 80%;
        margin-top: 5em;
        position: absolute;
        bottom: 0;
    }
    .carousel-card-container {
        position: relative;
        cursor: pointer;
        background-color:rgb(24, 24, 24);
        padding: 0 1em;
    }
</style>
