<template>
    <div>
        <MbSlider
            class="desk-hide"
            v-if="seriesWatchList.length"
            :items="seriesWatchList"
            :configuration="configuration"
            :id="'seriesWatchList'"
            :showFullMovieInfo="showSeriesInfo"
            :history="true"
            heading="Upcoming Episodes"
        />
        <el-row class="week-trends-container pt-2 mobile-hide">
            <el-col :span="15">
                <el-carousel
                    height="42rem"
                    :interval="7000"
                    @change="carouselChanged"
                    arrow="always"
                    class="ml-5"
                    id="trending-carousel"
                >
                    <el-carousel-item v-for="item in trendingListWeek" :key="item.id">
                        <div class="carousel-card-container" @click="carouselCardClicked(item)">
                            <div class="background-images-container justify-center">
                                <img
                                    v-lazy="{
                                        src: `${configuration.images.secure_base_url}w1280${item.backdrop_path}`,
                                    }"
                                    class="carousel-image shimmer-img"
                                    :alt="item.title || item.name"
                                />
                                <div class="background-image-gradient"></div>
                            </div>
                            <div class="info-container shadow-text" v-if="currentCarouselItem.id === item.id">
                                <h3 class="info-heading">
                                    {{ item.title || item.name }}
                                </h3>
                                <!-- Genres -->
                                <h6 class="genres" style="margin-bottom: 1.5em">
                                    <span v-for="(genreId, index) in item.genre_ids" :key="genreId">
                                        {{ getGenreName(genreId) }}
                                    </span>
                                    - {{ item.media_type }}
                                </h6>

                                <GoogleData class="googleData-container" :item="item" :rawGoogleData="googleData" />
                            </div>
                        </div>
                    </el-carousel-item>
                </el-carousel>
            </el-col>
            <el-col :span="9" class="sliders-container">
                <MbSlider
                    v-if="seriesWatchList.length"
                    :items="seriesWatchList"
                    :configuration="configuration"
                    :id="'seriesWatchList'"
                    :showFullMovieInfo="showSeriesInfo"
                    :history="true"
                    :hideBadge="true"
                    heading="Upcoming Episodes"
                    :externalLink="{
                        name: 'WatchList',
                    }"
                />
                <MbSlider
                    v-else
                    :items="currentStreaming"
                    :configuration="configuration"
                    :id="'currentStreaming'"
                    :showFullMovieInfo="showSeriesInfo"
                    :history="true"
                    :hideBadge="true"
                    heading="Streaming now"
                />
                <MbSlider
                    v-if="watchListMovies.length"
                    :items="watchListMovies"
                    :configuration="configuration"
                    :id="'watchListMovies'"
                    :showFullMovieInfo="showSeriesInfo"
                    :history="true"
                    :hideBadge="true"
                    heading="Movies Watch list"
                    :externalLink="{
                        name: 'Profile',
                    }"
                />
                <div v-else-if="savedFilters.length" class="m-4 p-3 heading">
                    <div class="mb-3">Saved Filters</div>
                    <div class="filters-container">
                        <div v-for="savedFilter in savedFilters" :key="savedFilter.name" class="mr-3 mb-3">
                            <router-link
                                :to="{
                                    name: 'discover',
                                    query: {
                                        ...savedFilter,
                                        isMovies: true,
                                    },
                                }"
                            >
                                <el-button
                                    :type="$route.query.name === savedFilter.name ? 'danger' : 'primary'"
                                >
                                    {{ savedFilter.name }}
                                </el-button>
                            </router-link>
                        </div>
                    </div>
                </div>
                <div v-else>
                    <MbSlider
                        :items="playingNowMovies"
                        :configuration="configuration"
                        :id="'playingNowMovies'"
                        :showFullMovieInfo="showSeriesInfo"
                        v-if="playingNowMovies.length"
                        :history="true"
                        :hideBadge="true"
                        heading="Now in Theatres"
                    />
                </div>
            </el-col>
        </el-row>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import { getRatingColor, mapGoogleData } from '@/common/utils';
import { sortBy, compact } from 'lodash';
import moment from 'moment';
import GoogleData from '../Common/googleData.vue';
import MbSlider from '@/components/Slider/index.vue';

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
    components: {
        GoogleData,
        MbSlider,
    },
    data() {
        return {
            getRatingColor,
            trendingListWeek: [],
            currentCarouselItem: {} as any,
            playingNowMovies: [] as any,
            currentStreaming: [] as any,
            historyLength: 4,
            popularMovies: [],
            googleData: {
                ratings: [],
                allWatchOptions: [],
            },
        };
    },
    mounted() {
        this.loadData();
    },
    computed: {
        getCarouselHeight() {
            return `${window.innerHeight / 2}px`;
        },
        savedFilters() {
            return this.$store.getters.savedFilters;
        },
        seriesWatchList() {
            let watchListSeries = this.$store.getters.watchListSeries;
            watchListSeries = this.getUpcomingEpicodes(watchListSeries);
            watchListSeries = sortBy(watchListSeries, 'upcomingTime');
            return watchListSeries;
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
        watchListMovies() {
            return this.$store.getters.watchListMovies;
        },
    },
    methods: {
        getUpcomingEpicodes(items) {
            return compact(
                items.map((series) => {
                    if (series.next_episode_to_air) {
                        const nextAirDays = moment({ hours: 0 }).diff(series.next_episode_to_air.air_date, 'days') * -1;
                        let upcomingText = `In ${nextAirDays} day${nextAirDays > 1 ? 's' : ''}`;
                        if (nextAirDays >= 11 || nextAirDays < 0) {
                            upcomingText = moment(series.next_episode_to_air.air_date).format('DD MMM YYYY');
                        } else if (nextAirDays === 0) {
                            upcomingText = 'Today';
                        }
                        series.bottomInfo = `${upcomingText} - S${series.next_episode_to_air.season_number} E${series.next_episode_to_air.episode_number}`;
                        series.upcomingTime = new Date(series.next_episode_to_air.air_date);
                        return series;
                    }
                }),
            );
        },
        carouselCardClicked(movie: any) {
            if (movie.id === this.currentCarouselItem.id) {
                this.showFullMovieInfo(movie);
            }
        },
        async carouselChanged(currentIndex: number) {
            this.currentCarouselItem = this.trendingListWeek[currentIndex];
            this.googleData = { ratings: [], allWatchOptions: [] };
            let googleData = {};
            if (this.currentCarouselItem.media_type === 'tv') {
                const details = await api.getTvDetails(this.currentCarouselItem.id);
                googleData = details.googleData;
            } else {
                const details = await api.getMovieDetails(this.currentCarouselItem.id);
                googleData = details.googleData;
            }
            this.googleData = mapGoogleData(googleData);
        },
        getGenreName(id: any) {
            let genre = this.movieGenres.find((genre) => genre.id === id);
            if (!genre) {
                genre = this.seriesGenres.find((genre) => genre.id === id);
            }
            if (genre) return genre.name;
        },
        async getPlayingNowMovies() {
            const res = await api.getNowPlayingMovies();
            this.playingNowMovies = res.results.filter(({ poster_path }) => poster_path);
        },
        async getCurrentStreaming() {
            const res = await api.getCurrentStreamingSeries();
            this.currentStreaming = res.results.filter(({ poster_path }) => poster_path);
        },
        async getTrendingListWeek() {
            const res = await api.getTrendingListWeek();
            this.trendingListWeek = res.results.slice(0, 10);
            this.carouselChanged(0);
        },
        async loadData() {
            this.getTrendingListWeek();
            this.getPlayingNowMovies();
            this.getCurrentStreaming();
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
.genres {
    font-size: 1rem;
}
.filters-container {
    display: flex;
    flex-wrap: wrap;
}
#trending-carousel {
    margin-top: 1rem;
}
.googleData-container {
    position: absolute;
    bottom: 2rem;
}
.justify-center {
    display: flex;
    justify-content: center;
}
.rating-container {
    span {
        font-size: 1em;
    }
}
.ratings-main-container {
    display: flex;
}
.heading {
    font-size: 17px;
    font-weight: 500;
    padding-left: 2.2em;
    padding-top: 1em;
    padding-bottom: 0.4em;
}
html.dark {
    .week-trends-container {
        background-color: rgb(24, 24, 24);
    }
}
.sliders-container {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    .main-slider-div {
        padding-top: 1rem;
        padding-bottom: 0;
    }
}
.background-images-container {
    filter: opacity(0.5);
    height: 100%;
    overflow: hidden;
    border-radius: 10px;
    border: 4px solid rgba(133, 133, 133, 0.274);
    .carousel-image {
        position: absolute;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 10% 0;
    }
    .carousel-image[lazy='loading'] {
        animation-duration: 1s;
    }
    .background-image-gradient {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, rgba(0,0,0,0.5) 10%, rgba(0,0,0,0) 100%);
    }
}
:deep(.movie-item) {
    height: 16rem;
    .movie-card-image {
        height: 16rem;
        margin-bottom: 1rem;
    }
}
:deep(.movie-card-text) {
    display: inherit;
}
.info-container {
    position: absolute;
    top: 4em;
    margin-left: 6em !important;
    overflow: hidden;
    color: @text-color;
    width: 80% !important;
    height: 90%;
    .info-heading {
        font-size: 2.3rem;
        color: #fff;
        text-shadow: 0px 0px 20px rgba(0, 0, 0);
    }
}
.secondary-info {
    color: rgb(228, 228, 228);
    text-shadow: 0px 0px 20px rgba(0, 0, 0);
}
.movie-overview {
    width: 80%;
    margin-top: 5em;
    position: absolute;
    bottom: 0;
    font-size: 0.9em;
}
.carousel-card-container {
    position: relative;
    cursor: pointer;
    background-color: rgb(24, 24, 24);
    height: 100%;
}
.lightMode {
    .week-trends-container {
        background-color: rgb(236, 236, 236);
    }
    .carousel-card-container {
        background-color: rgb(236, 236, 236);
    }
    .background-images-container {
        filter: opacity(1);
    }
}
</style>
