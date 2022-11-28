<template>
    <div class="m-4 pt-5 watch-list-container">
        <div class="share-list" v-if="user.displayName" @click="shareListModalVisible = true">
            <el-tooltip class="item" effect="light" content="Share this list" placement="left">
                <i class="fa-solid fa-share-nodes"></i>
            </el-tooltip>
        </div>
        <mb-slider
            :items="seriesWatchList"
            :configuration="configuration"
            heading="Upcoming Episodes"
            :id="'seriesWatchList'"
            :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true"
            v-if="seriesWatchList.length"
        ></mb-slider>
        <mb-slider
            :items="returningSeries"
            :configuration="configuration"
            heading="Returning Series"
            :id="'returningSeries'"
            :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true"
            v-if="returningSeries.length"
        ></mb-slider>
        <mb-slider
            :items="completedSeries"
            :configuration="configuration"
            heading="Completed Series"
            :id="'completedSeries'"
            :showFullMovieInfo="showSeriesInfo"
            :hideBadge="true"
            v-if="completedSeries.length"
        ></mb-slider>

        <div v-if="canShowOnbarding" class="onboarding-container">
            <div class="onboardingText">
                <p class="actualonboardingText">
                    You can track your favorite series here to know when the next episode will be coming out.
                    <span v-if="user.name">
                        You can add series to your watch list by visiting the series homepage and clicking on add to
                        watch list</span
                    >
                    <span v-else> Please login to access this feature</span>
                </p>
            </div>
            <img src="/images/stream-list.png" class="onboardingImage mobile-hide" />
        </div>

        <el-dialog title="Share Watch list link" :visible.sync="shareListModalVisible" width="30%">
            <el-input v-model="shareLink"></el-input>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import { compact, sortBy } from 'lodash';
import { getRatingColor } from '@/common/utils';
import moment from 'moment';
import Vue from 'vue';

export default Vue.extend({
    name: 'watchList',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            getRatingColor,
            shareListModalVisible: false,
        };
    },
    computed: {
        shareLink() {
            return `${window.location.hostname}/shareView/${this.user.uid}`;
        },
        canShowOnbarding() {
            return !this.$store.getters.watchListSeries.length;
        },
        user() {
            return this.$store.getters.user;
        },
        seriesWatchList() {
            let watchListSeries = this.$store.getters.watchListSeries;
            watchListSeries = compact(
                watchListSeries.map((series) => {
                    if (series.next_episode_to_air) {
                        const nextAirDays =
                            moment({ hours: 0 }).diff(series.next_episode_to_air?.air_date, 'days') * -1;
                        let upcomingText = `In ${nextAirDays} day${nextAirDays > 1 ? 's' : ''}`;
                        if (nextAirDays >= 11 || nextAirDays < 0) {
                            upcomingText = moment(series.next_episode_to_air?.air_date).format('DD MMM YYYY');
                        } else if (nextAirDays === 0) {
                            upcomingText = 'Today';
                        }
                        series.bottomInfo = `${upcomingText} - S${series.next_episode_to_air?.season_number} E${series.next_episode_to_air.episode_number}`;
                        series.upcomingTime = new Date(series.next_episode_to_air?.air_date);
                        return series;
                    }
                }),
            );
            watchListSeries = sortBy(watchListSeries, 'upcomingTime');
            return watchListSeries;
        },
        upcomingEpisodes() {
            return this.seriesWatchList.map((series) => {
                if (!series.next_episode_to_air.still_path) {
                    series.next_episode_to_air.still_path = series.backdrop_path;
                }
                return series.next_episode_to_air;
            });
        },
        returningSeries() {
            let watchListSeries = this.$store.getters.watchListSeries;
            watchListSeries = compact(
                watchListSeries.map((series) => {
                    if (series.status !== 'Ended' && !series.next_episode_to_air) {
                        series.lastTime = new Date(series.last_episode_to_air?.air_date);
                        series.bottomInfo = `Season ${series.last_episode_to_air?.season_number + 1}`;
                        return series;
                    }
                }),
            );
            watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
            return watchListSeries;
        },
        completedSeries() {
            let watchListSeries = this.$store.getters.watchListSeries;
            watchListSeries = compact(
                watchListSeries.map((series) => {
                    if (series.status === 'Ended') {
                        series.lastTime = new Date(series.last_episode_to_air?.air_date);
                        return series;
                    }
                }),
            );
            watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
            return watchListSeries;
        },
    },
});
</script>

<style scoped lang="less">
@import '../Assets/Styles/main.less';
.share-list {
    position: absolute;
    right: 3em;
    top: 4em;
    cursor: pointer;
}
.justify-center {
    display: flex;
    justify-content: center;
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
    box-shadow: 0px 0px 15px 2px #222;
    border: 1px #222 solid;
    background: #151515;
    color: #aaa;
    padding: 1rem;
    border-radius: 1em;
}
.onboardingImage {
    margin-top: 7em;
    padding: 1em;
    border-radius: 1rem;
    box-shadow: 0px 0px 15px 2px #222;
    border: 1px #222 solid;
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
        padding: 0.5em;
        border-radius: 1em;
        font-size: 0.8em;
        text-align: center;
    }
}
</style>
