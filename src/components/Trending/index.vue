<template>
    <div>
        <trending-carousel
            class="trending-carousel-container"
            :configuration="configuration"
            :showMovieInfoModal="showMovieInfo"
            :showFullMovieInfo="showFullMovieInfo"
            :showSeriesInfo="showSeriesInfo"
            :movieGenres="movieGenres"
            :seriesGenres="seriesGenres"
            :trendingMovies="trendingMovies"
        ></trending-carousel>
        <div>
            <div v-if="isTrendingDataLoaded" class="trending-sliders-container">
                <mb-slider
                    v-if="continueWatching.length"
                    :items="continueWatching"
                    :configuration="configuration"
                    :heading="'Continue Watching'"
                    :id="'continueWatching'"
                    :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showFullMovieInfo"
                    :isContinueWatching="true"
                ></mb-slider>
                <mb-slider
                    :items="trendingMovies"
                    :configuration="configuration"
                    :heading="'Trending Movies'"
                    :id="'trendingMovies'"
                    :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showFullMovieInfo"
                ></mb-slider>
                <mb-slider
                    :items="trendingTv"
                    :configuration="configuration"
                    :heading="'Trending Series'"
                    :id="'trendingSeries'"
                    :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showSeriesInfo"
                ></mb-slider>
                <mb-slider
                    v-if="recentVisits.length"
                    :items="recentVisits"
                    :configuration="configuration"
                    :id="'recentVisits'"
                    :showFullMovieInfo="showSeriesInfo"
                    heading="Recent visits"
                    :isWideCard="true"
                    class="mb-4"
                ></mb-slider>
                <div v-if="uuid.length && user.displayName">
                    <FilterView
                        :uuid="uuid"
                        :movieGenres="movieGenres"
                        :seriesGenres="seriesGenres"
                        :configuration="configuration"
                    />
                    <FilterView
                        :uuid="uuid"
                        :movieGenres="movieGenres"
                        :seriesGenres="seriesGenres"
                        :configuration="configuration"
                    />
                </div>
                <mb-slider
                    :items="currentAiring"
                    :configuration="configuration"
                    :heading="'Currently On Air'"
                    :id="'currentAiring'"
                    :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showSeriesInfo"
                ></mb-slider>
                <div v-if="uuid.length && user.displayName">
                    <FilterView
                        :uuid="uuid"
                        :movieGenres="movieGenres"
                        :seriesGenres="seriesGenres"
                        :configuration="configuration"
                    />
                    <FilterView
                        :uuid="uuid"
                        :movieGenres="movieGenres"
                        :seriesGenres="seriesGenres"
                        :configuration="configuration"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { api } from '@/API/api';
import CustomView from '@/components/CustomView/index.vue';
import FilterView from '@/components/FilterView/index.vue';
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import Vue from 'vue';

export default Vue.extend({
    name: 'trending',
    props: ['configuration', 'showMovieInfo', 'showFullMovieInfo', 'showSeriesInfo', 'movieGenres', 'seriesGenres'],
    components: {
        CustomView,
        FilterView,
    },
    data() {
        return {
            isTrendingDataLoaded: false,
            trendingTv: [],
            trendingMovies: [],
            trendingPeople: [],
            latestMovies: [] as any[],
            currentAiring: [] as any[],
            uuid: '',
        };
    },
    mounted() {
        this.uuid = uuidv4();
        this.loadData();
    },
    computed: {
        continueWatching() {
            return this.$store.getters.continueWatching;
        },
        recentVisits() {
            return this.$store.getters.recentVisits;
        },
        user() {
            return this.$store.getters.user;
        },
    },
    methods: {
        async loadData() {
            await Promise.all([
                this.getTrendingTv(),
                this.getTrendingMovies(),
                this.getLatestMovies(),
                this.getCurrentAiring(),
            ]);
            this.isTrendingDataLoaded = true;
        },
        async getTrendingTv() {
            const res = await api.getTrendingTv();
            this.trendingTv = res.results.filter(({ poster_path }) => poster_path);
        },
        async getTrendingMovies() {
            const res = await api.getTrendingMovies();
            this.trendingMovies = res.results.filter(({ poster_path }) => poster_path);
        },
        async getLatestMovies() {
            let { results: latestMovies } = await api.getLatestMovies();
            this.latestMovies = _.sortBy(latestMovies, ({ popularity }) => -popularity).filter(
                ({ poster_path }) => poster_path,
            );
        },
        async getCurrentAiring() {
            let { results: currentAiring } = await api.getCurrentStreamingSeries();
            this.currentAiring = _.sortBy(currentAiring, ({ popularity }) => -popularity).filter(
                ({ poster_path }) => poster_path,
            );
        },
    },
});
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
.justify-center {
    display: flex;
    justify-content: center;
}
.slider-bg {
    border-radius: 5px;
    background-size: 300% 300%;
    background-image: linear-gradient(
        -45deg,
        @background-gray-light 0%,
        #8f0b0b5e 25%,
        @background-gray-light 50%,
        #8f0b0b5e 100%
    );
    animation: AnimateBG 10s ease infinite;
    /deep/ .slider-bar {
        padding: 0;
        overflow-y: clip !important;
    }
    padding: 0 !important;
}
@keyframes AnimateBG {
    0% {
        background-position: 0% 50%;
    }
    50% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0% 50%;
    }
}
.trending-sliders-container {
    margin: 0 1em 2em 1em;
}
@media (max-width: 767px) {
    .trending-sliders-container {
        margin: 0.5em;
        padding-top: 0;
    }
    .trending-carousel-container {
        margin-top: 0.5em;
        margin-left: 0.5em;
    }
}
</style>
