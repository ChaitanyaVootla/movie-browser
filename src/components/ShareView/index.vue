<template>
    <div class="m-4 pt-5 watch-list-container">
        <div v-if="user.displayName" style="text-align: center" class="mt-2">
            <img :src="user.photoURL" class="user-photo" />
            <span class="ml-4 user-name">{{ user.displayName }}'s Watch list</span>
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
    </div>
</template>

<script lang="ts">
import { compact, sortBy } from 'lodash';
import { getRatingColor } from '@/common/utils';
import moment from 'moment';
import Vue from 'vue';

export default {
    name: 'shareView',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    data() {
        return {
            getRatingColor,
            isLoading: true,
            seriesList: [] as any[],
            user: {} as any,
        };
    },
    created() {
        this.getUsers();
    },
    computed: {
        user() {
            return this.$store.getters.user;
        },
        seriesWatchList() {
            let watchListSeries = this.seriesList;
            watchListSeries = compact(
                watchListSeries.map((series) => {
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
            let watchListSeries = this.seriesList;
            watchListSeries = compact(
                watchListSeries.map((series) => {
                    if (series.status !== 'Ended' && !series.next_episode_to_air) {
                        series.lastTime = new Date(series.last_episode_to_air.air_date);
                        series.bottomInfo = `Season ${series.last_episode_to_air.season_number + 1}`;
                        return series;
                    }
                }),
            );
            watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
            return watchListSeries;
        },
        completedSeries() {
            let watchListSeries = this.seriesList;
            watchListSeries = compact(
                watchListSeries.map((series) => {
                    if (series.status === 'Ended') {
                        series.lastTime = new Date(series.last_episode_to_air.air_date);
                        return series;
                    }
                }),
            );
            watchListSeries = sortBy(watchListSeries, 'lastTime').reverse();
            return watchListSeries;
        },
    },
    methods: {
        async getUsers() {
            // this.isLoading = true;
            // const user = await db.collection('users').doc(this.$route.params.userID).get();
            // this.user = user.data();
            // const seriesList = await db
            //     .collection('users')
            //     .doc(this.$route.params.userID)
            //     .collection('seriesWatchList')
            //     .get();
            // this.seriesList = seriesList.docs.map((doc) => doc.data());
            // this.isLoading = false;
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
.user-photo {
    width: 3em;
    border-radius: @default-radius;
}
.user-name {
    font-size: 1.2em;
    font-weight: 500;
}
</style>
