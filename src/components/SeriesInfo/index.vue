<template>
    <div style="position: relative">
        <div class="background-images-container" v-loading="detailsLoading">
            <img v-lazy="creditImageBasePath + details.backdrop_path" class="background-image" />
            <div v-if="details.backdrop_path && !showVideo && getYoutubeVideos().length" class="mobile-hide play-trailer" @click="showVideo=true">
                <font-awesome-icon :icon="['fas', 'play-circle']" />
                Play Trailer
            </div>
            <img v-if="details.backdrop_path && !showVideo" v-lazy="creditImageBasePath + details.backdrop_path" class="main-image" />
            <!-- Trailer/Video -->
            <div v-else-if="getYoutubeVideos().length" class="mobile-hide video-player"
                :key="details.id">
                <iframe
                    :id="`ytplayer-${details.id}`"
                    title="YouTube video player"
                    width="50%"
                    height="100%"
                    class="youtube-player"
                    :src="`https://www.youtube.com/embed/${selectedVideo.key || getYoutubeVideos()[0].key}?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${selectedVideo.key || getYoutubeVideos()[0].key}`"
                    frameborder="0"
                    controls="1"
                    modestbranding
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    enablejsapi="1"
                    style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0, 0, 0, 0.75)"
                    :key="selectedVideo.key || getYoutubeVideos()[0].key"
                >
                </iframe>
                <!-- <div class="dropdown">
                    <button
                        class="btn dropdown-toggle video-dropdown btn-dark m-0"
                        type="button"
                        id="dropdownMenuButton"
                        data-toggle="dropdown"
                        aria-haspopup="true"
                        aria-expanded="false"
                    >
                        {{ selectedVideo.name || getYoutubeVideos()[0].name }}
                    </button>
                    <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                        <a
                            class="dropdown-item"
                            v-for="video in getYoutubeVideos()"
                            :key="video.key"
                            v-on:click="selectVideo(video)"
                            >{{ video.name }}</a
                        >
                    </div>
                </div> -->
            </div>
        </div>
        <div class="all-info-container" v-if="details.name">
            <div class="heading-container">
                <h3>{{ details.name }}</h3>
                <span class="text-muted info-tagline pl-2" v-if="details.number_of_seasons">
                    {{ details.number_of_seasons }} Season{{ details.number_of_seasons > 1 ? 's' : '' }}
                </span>
                <rank :item="details"></rank>
            </div>

            <!-- Date and Genres -->
            <h6 class="mb-3 secondary-info">
                <span v-for="(genre, index) in details.genres" :key="index">
                    {{ genre.name }}{{ index === details.genres.length - 1 ? '' : ',' }}
                </span>
                <br/>
                <span style="line-height: 2rem;">
                    <span>{{ getDateText(details.first_air_date) }} - {{ details.status }}</span>
                    <span v-if="details.episode_run_time.length" class="pl-2">
                        <font-awesome-icon :icon="['far', 'clock']" />
                        {{ details.episode_run_time[0] }} mins
                    </span>
                    <span class="cursor-pointer ml-3" @click="openImageModal">
                        <font-awesome-icon :icon="['fas', 'images']" />
                    </span>
                </span>
            </h6>

            <!-- Watch links -->
            <GoogleData class="mt-4 googleData-container" :item="details" :key="details.id"
                :rawGoogleData="details.googleData"/>

            <!-- Additional info -->
            <div class="additional-info">
                <!-- bookmarks -->
                <div class="mt-3 ml-2 bookmarks">
                    <el-button @click="removeFromWatchList" v-if="isInWatchList">
                        In watch List
                        <font-awesome-icon :icon="['fas', 'check']" class="ml-1" />
                    </el-button>
                    <el-tooltip
                        v-else
                        class="item"
                        effect="light"
                        content="Sign in to use this feature"
                        placement="right"
                        :disabled="user.displayName"
                    >
                        <el-button @click="addToWatchList">
                            Add to watch list
                            <font-awesome-icon :icon="['fas', 'plus']" class="ml-1" />
                        </el-button>
                    </el-tooltip>
                </div>
            </div>
        </div>
        <div class="ml-4 mr-4 sliders-container">
            <!-- overview -->
            <div class="overview-container mb-2">
                <div class="overview-heading">
                    <h4>Overview</h4>
                    <a
                        v-if="imdbId"
                        :href="`https://www.imdb.com/title/${imdbId}/parentalguide`"
                        target="_blank"
                        class="mr-4"
                    >
                        <div class="parental-guide">
                            Parental Guide
                            <i class="el-icon-top-right"></i>
                        </div>
                    </a>
                </div>
                <div class="overview pt-3">
                    {{ details.overview }}
                </div>
                <rtReviews :item="details"></rtReviews>
                <!-- keywords -->
                <div class="keywords-container">
                    <router-link
                        v-for="keyword in showAllTags
                            ? keywords
                            : keywords.slice(0, 5)"
                        :key="keyword.id"
                        :to="{
                            name: 'discover',
                            query: {
                                keywords: keyword.name,
                                with_keywords: keyword.id,
                                isMovies: 'false',
                            },
                        }"
                    >
                        <div class="keyword">
                            {{ keyword.name }}
                        </div>
                    </router-link>
                    <span
                        v-if="keywords.length > 5"
                        class="expand-ellipsis"
                        @click="showAllTags = !showAllTags"
                        >...</span
                    >
                </div>
                <div class="mt-3 updatedInfo">
                    Last updated: {{sincetime(details.updatedAt)}}
                    <a @click="requestUpdate" class="ml-3">request update</a>
                </div>
            </div>
            <!-- Episodes slider -->
            <div class="mt-4 pt-3 pb-3 season-container">
                <el-select
                    class="season-dropdown ml-4 pl-3"
                    v-model="selectedSeason"
                    placeholder="Select"
                    @change="seasonChanged"
                >
                    <el-option v-for="item in seasons" :key="item.id" :label="item.name" :value="item.id">
                        {{ item.name }}
                    </el-option>
                </el-select>
                <span class="ml-3"
                    >{{ selectedSeasonInfo.episodes && selectedSeasonInfo.episodes.length }} Episodes -
                    {{ getDateText(selectedSeasonInfo.air_date) }}</span
                >
                <mb-slider
                    class="mt-2"
                    v-if="selectedSeasonInfo"
                    :seasonInfo="selectedSeasonInfo"
                    :items="selectedSeasonInfo.episodes"
                    :configuration="configuration"
                    :id="`season${selectedSeasonInfo.id}`"
                    :showHeader="true"
                    :seriesInfo="details"
                    :isEpisode="true"
                ></mb-slider>
            </div>

            <mb-slider
                class="mb-container"
                v-if="cast.length"
                :items="cast"
                :configuration="configuration"
                :heading="'Cast'"
                :id="'cast'"
                :selectPerson="selectPerson"
                :isPerson="true"
            ></mb-slider>

            <mb-slider
                class="mb-container"
                v-if="crew.length"
                :items="crew"
                :configuration="configuration"
                :heading="'Crew'"
                :id="'crew'"
                :selectPerson="selectPerson"
                :isPerson="true"
            ></mb-slider>
            <mb-slider
                class="mb-container"
                v-if="similarMovies.length"
                :items="similarMovies"
                :configuration="configuration"
                :heading="'Similar'"
                :id="'similar'"
                :showMovieInfoModal="showMovieInfo"
                :showFullMovieInfo="showSeriesInfo"
            ></mb-slider>
            <mb-slider
                class="mb-container"
                v-if="recommendedMovies.length"
                :items="recommendedMovies"
                :configuration="configuration"
                :heading="'Recommended'"
                :id="'recommended'"
                :showMovieInfoModal="showMovieInfo"
                :showFullMovieInfo="showSeriesInfo"
            ></mb-slider>
        </div>
        <div class="mb-5"></div>
        <el-dialog :visible.sync="dialogVisible" :width="defaultImageTab === 'backdrops' ? '95%' : '50%'" top="10vh">
            <el-tabs v-model="defaultImageTab">
                <el-tab-pane label="Backdrops" name="backdrops">
                    <el-carousel type="card" height="500px">
                        <el-carousel-item v-for="image in backdrops" :key="image.file_path">
                            <div class="justify-center">
                                <img
                                    v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }"
                                    height="500px"
                                />
                            </div>
                        </el-carousel-item>
                    </el-carousel>
                </el-tab-pane>
                <el-tab-pane label="Posters" name="posters">
                    <el-carousel type="card" height="500px">
                        <el-carousel-item v-for="image in posters" :key="image.file_path">
                            <div class="justify-center">
                                <img
                                    v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }"
                                    height="500px"
                                />
                            </div>
                        </el-carousel-item>
                    </el-carousel>
                </el-tab-pane>
            </el-tabs>
        </el-dialog>
    </div>
</template>

<script lang="ts">
import { api } from '../../API/api';
import _ from 'lodash';
import { getDateText } from '../../Common/utils';
import GoogleData from '../Common/googleData.vue';
import moment from 'moment';
import { mapActions } from 'vuex';
import rank from '@/components/Common/rank.vue';
import rtReviews from '@/components/Common/rottenTomatoesReviews.vue';

export default {
    name: 'seriesInfo',
    props: ['configuration', 'showMovieInfo', 'selectPerson', 'showSeriesInfo'],
    components: {
        GoogleData,
        rank,
        rtReviews,
    },
    data() {
        return {
            details: {} as any,
            creditImageBasePath: this.configuration.images.secure_base_url + 'h632',
            detailsLoading: true,
            activeName: 'movies',
            showVideo: false,
            videoTimeout: null,
            showFullBio: false,
            showAllTags: false,
            movie: {},
            selectedSeason: null,
            selectedSeasonInfo: {},
            recommendedMovies: [] as any[],
            similarMovies: [] as any[],
            cast: [] as any[],
            crew: [] as any[],
            seasons: [] as any[],
            selectedVideo: {},
            showFullOverview: false,
            activeTab: 'seasons',
            dialogVisible: false,
            backdrops: [] as any[],
            posters: [] as any[],
            defaultImageTab: 'backdrops',
            getDateText,
        };
    },
    created() {
        this.getDetails();
    },
    watch: {
        '$route.params.id': function () {
            this.getDetails();
        },
    },
    computed: {
        imdbId() {
            return this.details?.external_ids?.imdb_id;
        },
        keywords() {
            return this.details?.keywords?.results || [];
        },
        isInWatchList() {
            return this.$store.getters.watchListSeriesById(this.details.id);
        },
        user() {
            return this.$store.getters.user;
        },
        googleLink() {
            return `https://google.com/search?q=${this.details.name} tv series`;
        },
    },
    methods: {
        sincetime(time) {
            return moment(time).fromNow();
        },
        ...mapActions({
            addRecent: 'addRecent',
        }),
        async requestUpdate() {
            this.detailsLoading = true;
            try {
                this.details = await api.getTvDetails(this.details.id, 'force=true');
            } catch(e) {} finally {
                this.detailsLoading = false;
            }
        },
        openImageModal() {
            this.dialogVisible = true;
            this.backdrops = this.details.images.backdrops;
            this.posters = this.details.images.posters;
        },
        async seasonChanged() {
            this.selectedSeasonInfo = await api.getSeasonDetails(parseInt(this.$route.params.id), this.selectedSeason);
        },
        async getDetails() {
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            this.detailsLoading = true;
            this.details = await api.getTvDetails(parseInt(this.$route.params.id));
            this.updateHistoryData();
            this.similarMovies = this.details.similar.results;
            this.recommendedMovies = this.details.recommendations.results;
            this.cast = this.details.credits.cast;
            this.crew = _.sortBy(this.details.credits.crew, (person) => {
                if (person.job === 'Director') return 0;
                if (person.department === 'Directing') return 1;
                if (person.department === 'Writing') return 2;
                if (person.department === 'Production') return 3;
                if (person.department === 'Camera') return 4;
                return 100;
            });
            this.crew = _.sortBy(this.crew, ({ profile_path }) => {
                return profile_path ? 0 : 1;
            });
            this.seasons = [] as any[];
            for (let seasonNumber = 1; seasonNumber <= this.details.number_of_seasons; seasonNumber++) {
                const season = {
                    name: `Season ${seasonNumber}`,
                    id: seasonNumber,
                };
                const seasonDetails = this.details.seasons.find(
                    (apiSeason) => apiSeason.season_number === seasonNumber,
                );
                if (seasonDetails) {
                    season.name += ` - ${seasonDetails.name}`;
                }
                this.seasons.push(season);
            }
            this.selectedSeason = this.details.number_of_seasons;
            await this.seasonChanged();
            this.detailsLoading = false;
            this.showVideo = false;
        },
        updateHistoryData() {
            this.addRecent({id: this.details.id, isMovie: false, item: this.details})
        },
        addToWatchList() {
            api.addSeriesList(this.details.id);
        },
        removeFromWatchList() {
            api.removeSeriesList(this.details.id);
        },
        getYoutubeVideos: function () {
            return _.filter(this.details.videos?.results|| [], { site: 'YouTube' });
        },
        selectVideo(video: Object) {
            this.selectedVideo = video;
        },
        getYear: function (movieDate: any) {
            return new Date(movieDate).getFullYear();
        },
        getRatingColor: function (rating: number) {
            if (rating < 5) return 'red';
            if (rating < 6.5) return 'orange';
            if (rating < 8) return 'green';
            else return 'purple';
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';

@primary-container-height: max(50vh, 35rem);
@all-info-container: calc(max(50vh, 35rem) - 2rem);

.watch-price {
    font-size: 0.7rem;
    color: #aaa;
}
.season-container {
    background-color: rgba(148, 148, 148, 0.05);
}
.heading-container {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}
.background-images-container {
    height: @primary-container-height;
    overflow: hidden;
    display: flex;
    justify-content: center;
    position: relative;
    filter: opacity(0.9);
    pointer-events: none;
    .play-trailer {
        position: absolute;
        bottom: 3rem;
        left: 30vw;
        z-index: 10;
        color: black;
        background-color: rgba(245, 245, 245, 0.808);
        opacity: 0.9;
        font-weight: 700;
        padding: 1rem;
        border-radius: 2rem;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0px 0px 35px 5px rgba(0,0,0,0.75);
        cursor: pointer;
        pointer-events: all;
        svg {
            font-size: 1.5rem;
        }
    }
    .main-image[lazy='loading'] {
        box-shadow: none;
        .play-trailer {
            display: none;
        }
    }
    .main-image {
        background-size: auto;
        height: @primary-container-height;
        object-fit: cover;
        object-position: 50% 5%;
        overflow: hidden;
        border-bottom-left-radius: 1rem;
        border-bottom-right-radius: 1rem;
        z-index: 1;
        box-shadow: 0px 0px 35px 5px rgba(0,0,0,0.75);
    }
    .background-image {
        position: absolute;
        background-size: auto;
        height: @primary-container-height;
        object-fit: cover;
        object-position: 50% 25%;
        width: 100%;
        overflow: hidden;
        filter: opacity(0.1) blur(2px);
    }
    .video-player {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        right: 1rem;
        display: flex;
        justify-content: center;
        align-content: center;
        align-items: center;
        iframe {
            pointer-events: all;
            border-radius: 1rem;
        }
    }
}
.video-dropdown {
    margin-top: 0.6em;
    background: #111;
    border-color: #111;
    color: #ccc;
    width: 100%;
}
.ratings-main-container {
    display: flex;
}
.rating-container {
    padding-top: 0.2em;
    width: 4em;
    text-align: center;
    img {
        width: 2.2em;
    }
    span {
        font-size: 0.9em;
    }
}
.ott-icon {
    width: 3em;
}
.dropdown-menu {
    max-height: 20em;
    overflow: auto;
    background: #000;
    color: #ccc;
}
.dropdown-item {
    cursor: pointer;
}
.dropdown-item:hover {
    color: black !important;
}
.dropdown-menu-middle {
    width: 100%;
    max-width: 100%;
}
.all-info-container {
    position: absolute;
    top: 2em;
    height: @all-info-container;
    padding-left: 4.5rem !important;
    overflow: hidden;
    color: @text-color;
    width: 25%;
}
.secondary-info {
    color: #aaa;
}
.ext-link-icon {
    font-size: 1.2em;
    color: @link-color-red;
}
.additional-info {
    position: absolute;
    bottom: 1rem;
    left: 4rem;
    .movie-overview {
        width: 90%;
        margin-top: 1em;
    }
}
.info-tagline {
    color: #ddd !important;
}
/deep/ .el-tabs__header {
    padding: 0 2em !important;
}
/deep/ .el-tabs__nav-wrap::after {
    height: 0;
}
.cursor-pointer {
    cursor: pointer;
}
.justify-center {
    display: flex;
    justify-content: center;
}
/deep/ .el-dialog__body {
    padding-top: 0;
}
@media (min-width: 768px) {
    .season-dropdown {
        width: 25rem;
    }
}
@media (max-width: 767px) {
    .season-dropdown {
        margin: 0 !important;
        padding: 0 !important;
    }
    .background-images-container {
        height: calc(100vh/2) !important;
        font-size: 0.8em !important;
    }
    .background-image {
        height: calc(100vh/2) !important;
    }
    .additional-info {
        position: absolute;
        bottom: 12rem;
        left: 0;
        .bookmarks {
            top: 2rem;
            left: 1rem;
        }
        .external-links {
            position: absolute;
            display: flex;
            margin-left: 1rem !important;
        }
    }
    .youtube-player {
        height: 100 !important;
        width: 100 !important;
    }
    .all-info-container {
        top: 1em;
        display: grid;
        grid-auto-rows: max(3em);
        margin: 0;
        padding: 1em !important;
        width: 100%;
        top: 0;
        > div {
            margin: 0;
            padding: 0 !important;
        }
    }
    .googleData-container {
        margin-top: 2rem !important;
        margin-left: 0 !important;
    }
    .rating-info {
        font-size: 1em;
    }
    .budget-text {
        position: relative !important;
        top: 0 !important;
    }
    .bookmarks {
        font-size: 0.9em;
        position: absolute;
        right: 2em;
        top: 12rem;
    }
    .secondary-info {
        font-size: 0.8em;
        margin: 0 !important;
    }
    .mb-container {
        margin: 0.5em !important;
    }
    .sliders-container {
        margin: 0 !important;
        padding: 0 !important;
    }
    .season-container {
        margin: 0 !important;
        padding: 0.5em !important;
        font-size: 0.8em;
    }
    .seasons-heading {
        margin: 0 !important;
        padding: 0 !important;
    }
}
</style>
