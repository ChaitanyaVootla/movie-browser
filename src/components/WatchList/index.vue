<template>
    <div class="m-4 pt-5 watch-list-container">
        <!-- <el-row class="mr-5">
            <el-col span="12">
                <el-carousel height="450px" :interval="7000" arrow="always" class="ml-4 carousel">
                    <el-carousel-item v-for="series in seriesWatchList" :key="series.id">
                        <div class="carousel-card-container" @click="carouselCardClicked(series)">
                            <div class="background-images-container justify-center">
                                <img v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${series.backdrop_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }" height="640px"
                                />
                            </div>
                            <div class="info-container">
                                <h3 div="info-heading">
                                    {{series.title || series.name}}
                                </h3>
                                <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                                    <span v-for="(genre, index) in series.genres" :key="genre.id">
                                        {{genre.name}}{{index===series.genres.length-1?'':','}}
                                    </span>
                                </h6>
                                <div class="mt-5 pt-5">
                                    <span class="rating-info" :style="`border-color: ${getRatingColor(series.vote_average)};
                                        color: ${getRatingColor(series.vote_average)}`">
                                        {{series.vote_average}}
                                    </span>
                                </div>
                                <div class="movie-overview p-3 mt-10">
                                    <span>{{series.overview.slice(0, 200)}}</span>
                                </div>
                            </div>
                        </div>
                    </el-carousel-item>
                </el-carousel>
            </el-col>
            <el-col span="12">
                <el-carousel height="450px" :interval="7000" arrow="always" class="ml-4 carousel">
                    <el-carousel-item v-for="series in returningSeries" :key="series.id">
                        <div class="carousel-card-container" @click="carouselCardClicked(series)">
                            <div class="background-images-container justify-center">
                                <img v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${series.backdrop_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }" height="640px"
                                />
                            </div>
                            <div class="info-container">
                                <h3 div="info-heading">
                                    {{series.title || series.name}}
                                </h3>
                                <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                                    <span v-for="(genre, index) in series.genres" :key="genre.id">
                                        {{genre.name}}{{index===series.genres.length-1?'':','}}
                                    </span>
                                </h6>
                                <div class="mt-5 pt-5">
                                    <span class="rating-info" :style="`border-color: ${getRatingColor(series.vote_average)};
                                        color: ${getRatingColor(series.vote_average)}`">
                                        {{series.vote_average}}
                                    </span>
                                </div>
                                <div class="movie-overview p-3 mt-10">
                                    <span>{{series.overview.slice(0, 200)}}</span>
                                </div>
                            </div>
                        </div>
                    </el-carousel-item>
                </el-carousel>
            </el-col>
        </el-row> -->

        <!-- <season-slider :movies="upcomingEpisodes" :configuration="configuration"
            :id="`season${upcomingEpisodes.id}`"></season-slider> -->
        <div class="share-list" v-if="user.displayName" @click="shareListModalVisible = true">
            <el-tooltip class="item" effect="light" content="Share this list" placement="left">
                <font-awesome-icon :icon="['fas', 'share-alt']"/>
            </el-tooltip>
        </div>
        <mb-slider :items="seriesWatchList" :configuration="configuration"
            heading="Upcoming Episodes" :id="'seriesWatchList'" :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true" v-if="seriesWatchList.length"></mb-slider>
        <mb-slider :items="returningSeries" :configuration="configuration"
            heading="Returning Series" :id="'returningSeries'" :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true" v-if="returningSeries.length"></mb-slider>
        <mb-slider :items="completedSeries" :configuration="configuration"
            heading="Completed Series" :id="'completedSeries'" :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true" v-if="completedSeries.length"></mb-slider>

        <div v-if="canShowOnbarding" class="onboarding-container">
            <div class="onboardingText">
                <p class="actualonboardingText">
                    You can track your favorite series here to know when the next episode will be coming out.
                    <span v-if="user"> You can add series to your watch list by visiting the series homepage and clicking on add to watch list</span>
                    <span v-else> Please login to access this feature</span>
                </p>
            </div>
            <img src="/images/stream-list.png" class="onboardingImage mobile-hide"/>
        </div>

        <el-dialog title="Share Watch list link" :visible.sync="shareListModalVisible"
            width="30%">
            <el-input v-model="shareLink"></el-input>
        </el-dialog>
    </div>
</template>

<script lang="ts">
    import { compact, sortBy } from 'lodash';
    import { getRatingColor } from '../../Common/utils';
    import moment from 'moment';
    import { db } from '../../Common/firebase';

    export default {
        name: 'watchList',
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
                getRatingColor,
                shareListModalVisible: false,
            }
        },
        created() {
            this.getUsers();
        },
        computed: {
            shareLink() {
                return `${window.location.hostname}/shareView/${this.user.uid}`
            },
            canShowOnbarding() {
                return !this.$store.getters.watchListSeries.length;
            },
            user() {
                return this.$store.getters.user;
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
            upcomingEpisodes() {
                return this.seriesWatchList.map(series => {
                    if (!series.next_episode_to_air.still_path) {
                        series.next_episode_to_air.still_path = series.backdrop_path;
                    }
                    return series.next_episode_to_air;
                });
            },
            returningSeries() {
                let watchListSeries = this.$store.getters.watchListSeries;
                watchListSeries = compact(watchListSeries.map(
                    series => {
                        if (series.status !== 'Ended' && !series.next_episode_to_air) {
                            if (!series.last_episode_to_air)
                                console.log(series);
                            series.lastTime = new Date(series.last_episode_to_air.air_date);
                            series.bottomInfo = `Season ${series.last_episode_to_air.season_number + 1}`;
                            return series;
                        }
                    }
                ));
                watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
                return watchListSeries;
            },
            completedSeries() {
                let watchListSeries = this.$store.getters.watchListSeries;
                watchListSeries = compact(watchListSeries.map(
                    series => {
                        if (series.status === 'Ended') {
                            series.lastTime = new Date(series.last_episode_to_air.air_date);
                            return series;
                        }
                    }
                ));
                watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
                return watchListSeries;
            },
        },
        methods: {
            async getUsers() {
                const usersDB = await db.collection('users').get();
                const users = usersDB.docs.map(user => {
                    const userInfo = user.data();
                    return {
                        ...userInfo,
                        id: user.id,
                    } as any;
                });

                const surya = users.find(({displayName}) => displayName.includes('Surya'));
                console.log(surya);
                const res = await db.collection('users').doc(surya.id).collection('seriesWatchList').get();
                console.log(res.docs.map(doc => doc.data()));
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .share-list {
        position: absolute;
        right: 3em;
        top: 4em;
        cursor: pointer;
    }
    .justify-center {
        display:flex;
        justify-content:center;
    }
    .carousel {
        width: 100%;
    }
    .background-images-container {
        filter: opacity(0.5);
        overflow: hidden;
        height: 450px;
        border-radius: 0.2em;
    }
    .info-container {
        position: absolute;
        top: 2em;
        margin-left: 6em !important;
        overflow: hidden;
        color: @text-color;
        width: 80% !important;
        height: 350px;
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
        padding: 0 1em;
    }
    .onboardingText {
        font-size: 20px;
        font-weight: 600;
        vertical-align: middle;
        padding-top: 30em;
        margin-right: 5em;
    }
    .actualonboardingText {
        box-shadow: 4px 4px 30px 7px #333;
        background: #151515;
        color: @main-red;
        padding: .5em;
        border-radius: 1em;
    }
    .onboardingImage {
        margin-top: 7em;
        padding: 1em;
        box-shadow: 4px 4px 30px 7px #333;
    }
    .onboarding-container {
        display: flex;
        justify-content: space-around;
    }
    @media (max-width: 767px) {
        .watch-list-container {
            margin: 0.5em !important;
            padding: 0 !important;
        }
        .onboardingText {
            padding: 0;
            margin: 0;
        }
        .onboarding-container {
            margin-top: 50%;
        }
        .actualonboardingText {
            box-shadow: none;
            background: none;
            color: @text-color;
            padding: .5em;
            border-radius: 1em;
            font-size: 0.8em;
            text-align: center;
        }
    }
</style>
