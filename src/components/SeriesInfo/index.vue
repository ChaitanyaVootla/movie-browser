<template>
    <div style="position: relative">
        <div class="background-images-container" v-loading="detailsLoading">
            <img v-lazy="creditImageBasePath + details.backdrop_path" class="background-image" />
        </div>
        <div class="all-info-container" v-if="details.name">
            <h3 div="info-heading">
                {{ details.name }}
                <span class="text-muted info-tagline pl-2" v-if="details.number_of_seasons">
                    {{ details.number_of_seasons }} Season{{ details.number_of_seasons > 1 ? 's' : '' }}
                </span>
            </h3>

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

            <!-- Additional info -->
            <!-- <div class="secondary-info">
            </div> -->

            <!-- Watch links -->
            <GoogleData class="mt-4" :item="details" :key="details.id" />

            <!-- Additional info -->
            <div class="additional-info">
                <!-- External links -->
                <div class="mt-1 ml-2 external-links">
                    <a :href="googleLink" target="_blank" class="mr-3">
                        <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon" /> </a
                    >&nbsp;
                    <a
                        v-if="details.external_ids.imdb_id"
                        :href="`https://www.imdb.com/title/${details.external_ids.imdb_id}/parentalguide`"
                        target="_blank"
                        class="mr-3"
                    >
                        <font-awesome-icon :icon="['fas', 'exclamation-circle']" class="ext-link-icon" />&nbsp;
                    </a>
                    <a v-if="details && details.homepage" :href="details.homepage" target="_blank" class="mr-3">
                        <font-awesome-icon icon="external-link-square-alt" class="ext-link-icon" />
                    </a>
                </div>

                <!-- bookmarks -->
                <div class="mt-3 bookmarks">
                    <el-button v-if="isInWatchList">
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
                        <el-button @click="AddToWatchList">
                            Add to watch list
                            <font-awesome-icon :icon="['fas', 'plus']" class="ml-1" />
                        </el-button>
                    </el-tooltip>
                </div>

                <!-- overview -->
                <div class="movie-overview frosted mobile-hide mt-3 p-2">
                    <span v-if="showFullOverview">{{ details.overview }}</span>
                    <span v-if="!showFullOverview">{{ details.overview.slice(0, 200) }}</span>
                    <span
                        v-if="details.overview.length > 200"
                        class="expand-ellipsis ml-3"
                        @click="showFullOverview = !showFullOverview"
                        >...</span
                    >
                    <br />
                    <router-link
                        v-for="keyword in details.keywords.results"
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
                        <el-tag type="info" size="mini" class="mr-2">
                            {{ keyword.name }}
                        </el-tag>
                    </router-link>
                </div>
            </div>
        </div>
        <!-- Trailer/Video -->
        <div
            v-if="getYoutubeVideos(details.videos.results).length"
            style="position: absolute; top: 3em; right: 3em"
            class="mobile-hide"
            :key="details.id"
        >
            <iframe
                id="ytplayer"
                type="text/html"
                width="640"
                height="360"
                :src="`https://www.youtube.com/embed/${
                    selectedVideo.key || getYoutubeVideos(details.videos.results)[0].key
                }`"
                frameborder="0"
                iv_load_policy="3"
                fs="1"
                allowfullscreen="true"
                autoplay="1"
                style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0, 0, 0, 0.75)"
                :key="selectedVideo.key || getYoutubeVideos(details.videos.results)[0].key"
            >
            </iframe>
            <div class="dropdown">
                <button
                    class="btn dropdown-toggle video-dropdown btn-dark m-0"
                    type="button"
                    id="dropdownMenuButton"
                    data-toggle="dropdown"
                    aria-haspopup="true"
                    aria-expanded="false"
                >
                    {{ selectedVideo.name || getYoutubeVideos(details.videos.results)[0].name }}
                </button>
                <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                    <a
                        class="dropdown-item"
                        v-for="video in details.videos.results"
                        :key="video.key"
                        v-on:click="selectVideo(video)"
                        >{{ video.name }}</a
                    >
                </div>
            </div>
        </div>
        <div class="ml-4 mr-4 sliders-container">
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
                    >{{ selectedSeasonInfo.episodes.length }} Episodes -
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
import _, { sortBy } from 'lodash';
import { getDateText } from '../../Common/utils';
import { onAuthStateChanged, auth, db } from '../../Common/firebase';
import { omit } from 'lodash';
import { HISTORY_OMIT_VALUES } from '../../Common/constants';
import GoogleData from '../Common/googleData.vue';
import { doc, setDoc } from 'firebase/firestore';

export default {
    name: 'seriesInfo',
    props: ['configuration', 'showMovieInfo', 'selectPerson', 'showSeriesInfo'],
    components: {
        GoogleData,
    },
    data() {
        return {
            details: {} as any,
            creditImageBasePath: this.configuration.images.secure_base_url + 'h632',
            detailsLoading: true,
            activeName: 'movies',
            showFullBio: false,
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
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            this.getDetails();
        },
    },
    computed: {
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
        watchNowClicked(watchOption) {
            if (!this.user.displayName) {
                return;
            }
            setDoc(doc(db, `users/${this.user.uid}/continueWatching/${this.details.id}`), {
                watchOption,
                ...this.details,
                updatedAt: Date.now(),
            });
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
        },
        updateHistoryData() {
            onAuthStateChanged(auth, async (user) => {
                if (user && this.$store.getters.allLoaded) {
                    let recentVisits = this.$store.getters.recentVisits;
                    const historyDocToAdd = {
                        ...omit(this.details, HISTORY_OMIT_VALUES),
                        updatedAt: Date.now(),
                    } as any;
                    const addedItem = recentVisits.find(
                        ({ id, title }) => historyDocToAdd.id === id && historyDocToAdd.title === title,
                    );
                    if (addedItem) {
                        recentVisits = recentVisits.filter(
                            ({ id, title }) => !(historyDocToAdd.id === id && historyDocToAdd.title === title),
                        );
                    }
                    recentVisits.push(historyDocToAdd);
                    setDoc(doc(db, `users/${this.user.uid}/userData/recentVisits`),
                        Object.assign({}, sortBy(recentVisits, 'updatedAt').reverse().slice(0, 10)));
                }
            });
        },
        AddToWatchList() {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const historyDocToAdd = {
                        ...omit(this.details, HISTORY_OMIT_VALUES),
                        updatedAt: Date.now(),
                    };
                    setDoc(doc(db, `users/${this.user.uid}/seriesWatchList/${this.details.id}`), historyDocToAdd);
                }
            });
        },
        getYoutubeVideos: function (videos: Array<Object>) {
            return _.filter(videos, { site: 'YouTube' });
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

@primary-container-height: 50vh;

.watch-price {
    font-size: 0.7rem;
    color: #aaa;
}
.season-container {
    background-color: rgba(148, 148, 148, 0.05);
}
.background-images-container {
    height: @primary-container-height;
    overflow: hidden;
}
.background-image {
    background-size: contain;
    height: @primary-container-height;
    object-fit: cover;
    object-position: 50% 25%;
    width: 100%;
    overflow: hidden;
    box-shadow: 0px 0px 200px 100px rgba(0, 0, 0, 1);
    filter: opacity(0.3) blur(1px);
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
    height: calc(@primary-container-height - 1.5rem);
    padding-left: 4.5rem !important;
    overflow: hidden;
    color: @text-color;
    width: 100%;
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
    font-size: 0.5em;
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
        margin: 0 !important;
        padding: 1em !important;
        top: 0;
        > div {
            margin: 0 !important;
            padding: 0 !important;
        }
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
