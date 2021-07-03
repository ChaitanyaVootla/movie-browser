<template>
    <div style="position:relative;">
        <div class="background-images-container" v-loading="detailsLoading">
            <img v-lazy="creditImageBasePath + details.backdrop_path" class="background-image"/>
        </div>
        <div class="info-container ml-4" v-if="details.name">
            <h3 div="info-heading">
                {{details.name}}
                <span class="text-muted info-tagline pl-2" v-if="details.number_of_seasons">
                    {{details.number_of_seasons}} Season{{details.number_of_seasons> 1?'s':''}}
                </span>
            </h3>

            <!-- Date and Genres -->
            <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                <span v-for="(genre, index) in details.genres" :key="index">
                    {{genre.name}}{{index===details.genres.length-1?'':','}}
                </span>
            </h6>

            <!-- Additional info -->
            <div>
                {{getDateText(details.first_air_date)}} - {{details.status}}
                <span v-if="details.episode_run_time.length" class=" pl-2">
                    <font-awesome-icon :icon="['far', 'clock']"/>
                    {{details.episode_run_time[0]}} mins
                </span>
                <span class="cursor-pointer ml-3" @click="openImageModal">
                    <font-awesome-icon :icon="['fas', 'images']"/>
                </span>
            </div>

            <!-- External links -->
            <div class="ext-links-container mt-4">
                <a :href="`https://google.com/search?q=${details.name} series`"
                    target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                </a>&nbsp;
                <a :href="`https://www.iptorrents.com/t?q=${details.name};o=seeders#torrents`"
                    target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fas', 'magnet']" class="ext-link-icon"/>
                </a>&nbsp;
                <a v-if="details && details.homepage" :href="details.homepage" target="_blank" class="mr-3">
                    <font-awesome-icon icon="external-link-square-alt" class="ext-link-icon"/>
                </a>
            </div>

            <!-- Rating -->
            <div class="mt-4 pt-4">
                <span class="rating-info" :style="`border-color: ${getRatingColor(details.vote_average)}; color: ${getRatingColor(details.vote_average)}`">
                    {{details.vote_average}}
                </span>
                <el-tooltip class="item" effect="dark" :content="`${details.vote_count} ratings`"
                    placement="right">
                    <span class="vote-count ml-2">{{details.vote_count}} <i class="el-icon-star-off"></i></span>
                </el-tooltip>
            </div>

            <!-- bookmarks -->
            <div class="mt-4 bookmarks">
                <el-button v-if="isInWatchList">
                    In watch List
                    <font-awesome-icon :icon="['fas', 'check']" class="ml-1"/>
                </el-button>
                <el-tooltip v-else class="item" effect="dark" content="Sign in to use this feature"
                    placement="right" :disabled="user.displayName">
                    <el-button @click="AddToWatchList">
                        Add to watch list
                        <font-awesome-icon :icon="['fas', 'plus']" class="ml-1"/>
                    </el-button>
                </el-tooltip>
            </div>

            <!-- Movie overview -->
            <div class="movie-overview mobile-hide p-2">
                <span v-if="showFullOverview">{{details.overview}}</span>
                <span v-if="!showFullOverview">{{details.overview.slice(0, 200)}}</span>
                <span v-if="details.overview.length > 200" class="expand-ellipsis ml-3" @click="showFullOverview = !showFullOverview">...</span>
            </div>

            <!-- keywords -->
            <div class="mobile-hide">
                <router-link v-for="keyword in details.keywords.results" :key="keyword.id" class="mr-2"
                    :to="{
                        name: 'discover',
                        query:
                            {
                                keywords: keyword.name,
                                with_keywords: keyword.id,
                                isMovies: 'false'
                            }
                        }">
                    <el-tag type="info" size="mini">
                        {{keyword.name}}
                    </el-tag>
                </router-link>
            </div>
        </div>
        <!-- Trailer/Video -->
        <div v-if="getYoutubeVideos(details.videos.results).length" style="position: absolute; top: 3em; right: 3em;" class="mobile-hide"
            :key="details.id">
            <iframe id="ytplayer" type="text/html" width="640" height="360"
                :src="`https://www.youtube.com/embed/${selectedVideo.key || getYoutubeVideos(details.videos.results)[0].key}`"
                frameborder="0" iv_load_policy="3" fs="1" allowfullscreen="true" autoplay="1"
                style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0,0,0,0.75);">
            </iframe>
            <div class="dropdown">
                <button class="btn dropdown-toggle video-dropdown btn-dark m-0"
                    type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    {{selectedVideo.name || getYoutubeVideos(details.videos.results)[0].name}}
                </button>
                <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                    <a class="dropdown-item" v-for="video in details.videos.results" :key="video.key"
                        v-on:click="selectVideo(video)">{{video.name}}</a>
                </div>
            </div>
        </div>
        <div class="ml-4 mr-4">
            <mb-slider v-if="cast.length" :items="cast" :configuration="configuration" :heading="'Cast'" :id="'cast'"
                :selectPerson="selectPerson" :isPerson="true"></mb-slider>

            <!-- Episodes slider -->
            <div class="mt-4 pt-3 pb-3 season-container">
                <span class="ml-4 pl-3 mr-3">Seasons</span>
                <el-select v-model="selectedSeason" placeholder="Select" @change="seasonChanged">
                    <el-option
                        v-for="item in seasons"
                        :key="item.id"
                        :label="item.name"
                        :value="item.id">
                    </el-option>
                </el-select> <span class="ml-3">{{selectedSeasonInfo.episodes.length}} Episodes - {{getDateText(selectedSeasonInfo.air_date)}}</span>
                <!-- <season-slider v-if="selectedSeasonInfo" :seasonInfo="selectedSeasonInfo" :movies="selectedSeasonInfo.episodes" :configuration="configuration"
                    :id="`season${selectedSeasonInfo.id}`" :showHeader="true" :seriesInfo="details"></season-slider> -->
                <mb-slider v-if="selectedSeasonInfo" :seasonInfo="selectedSeasonInfo" :items="selectedSeasonInfo.episodes" :configuration="configuration"
                    :id="`season${selectedSeasonInfo.id}`" :showHeader="true" :seriesInfo="details" :isEpisode="true"></mb-slider>
            </div>

            <mb-slider v-if="crew.length" :items="crew" :configuration="configuration" :heading="'Crew'" :id="'crew'"
                :selectPerson="selectPerson" :isPerson="true"></mb-slider>
            <mb-slider v-if="similarMovies.length" :items="similarMovies" :configuration="configuration" :heading="'Similar'" :id="'similar'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></mb-slider>
            <mb-slider v-if="recommendedMovies.length" :items="recommendedMovies" :configuration="configuration"
                :heading="'Recommended'" :id="'recommended'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showSeriesInfo"></mb-slider>
        </div>

        <div class="mb-5"></div>
        <el-dialog
            :visible.sync="dialogVisible"
            :width="defaultImageTab === 'backdrops'?'95%':'50%'"
            top="10vh">
            <el-tabs v-model="defaultImageTab">
                <el-tab-pane label="Backdrops" name="backdrops">
                    <el-carousel type="card" height="500px">
                        <el-carousel-item v-for="image in backdrops" :key="image.file_path">
                            <div class="justify-center">
                                <img v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }" height="500px"
                                />
                            </div>
                        </el-carousel-item>
                    </el-carousel>
                </el-tab-pane>
                <el-tab-pane label="Posters" name="posters">
                    <el-carousel type="card" height="500px">
                        <el-carousel-item v-for="image in posters" :key="image.file_path">
                            <div class="justify-center">
                                <img v-lazy="{
                                        src: `${configuration.images.secure_base_url}h632${image.file_path}`,
                                        error: require('../../Assets/Images/error.svg'),
                                        loading: require('../../Assets/Images/loader-bars.svg'),
                                    }" height="500px"
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
    import { pushItemByName } from '../../Common/localStorageAdapter';
    import { getDateText } from '../../Common/utils';
    import { signIn, firebase, signOut, db } from '../../Common/firebase';
    import { omit } from 'lodash';
    import { HISTORY_OMIT_VALUES } from '../../Common/constants'

    export default {
        name: 'seriesInfo',
        props: [
            'configuration',
            'showMovieInfo',
            'selectPerson',
            'showSeriesInfo',
        ],
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
          }
        },
        created() {
            this.getDetails();
        },
        watch: {
            '$route.params.id': function () {
                document.body.scrollTop = document.documentElement.scrollTop = 0;
                this.getDetails();
            }
        },
        computed: {
            isInWatchList() {
                return this.$store.getters.watchListSeriesById(this.details.id);
            },
            user() {
                return this.$store.getters.user;
            },
        },
        methods: {
            openImageModal() {
                this.dialogVisible = true;
                this.backdrops = this.details.images.backdrops;
                this.posters = this.details.images.posters;
            },
            async seasonChanged() {
                this.selectedSeasonInfo = await api.getSeasonDetails(parseInt(this.$route.params.id),
                    this.selectedSeason);
            },
            async getDetails() {
                this.detailsLoading = true;
                this.details = await api.getTvDetails(parseInt(this.$route.params.id));
                this.updateHistoryData();
                this.similarMovies = this.details.similar.results;
                this.recommendedMovies = this.details.recommendations.results;
                this.cast = this.details.credits.cast;
                this.crew = _.sortBy(this.details.credits.crew,
                    (person) => {
                        if (person.job === 'Director')
                            return 0;
                        if (person.department === 'Directing')
                            return 1;
                        if (person.department === 'Writing')
                            return 2;
                        if (person.department === 'Production')
                            return 3;
                        if (person.department === 'Camera')
                            return 4;
                        return 100;
                    }
                );
                this.crew = _.sortBy(this.crew,
                    ({profile_path}) => {
                        return profile_path ? 0 : 1;
                    }
                );
                this.seasons = [] as any[];
                for (let seasonNumber = 1; seasonNumber <= this.details.number_of_seasons; seasonNumber++) {
                    this.seasons.push({
                        name: `Season ${seasonNumber}`,
                        id: seasonNumber,
                    });
                }
                this.selectedSeason = this.details.number_of_seasons;
                await this.seasonChanged();
                this.detailsLoading = false;
            },
            updateHistoryData() {
                // firebase.auth().onAuthStateChanged(
                //     async (user) => {
                //         if (user) {
                //             const userDbRef = db.collection('users').doc(user.uid);
                //             const historyDocToAdd = {
                //                 ...omit(this.details, HISTORY_OMIT_VALUES),
                //                 updatedAt: Date.now(),
                //             }
                //             userDbRef.collection('seriesHistory').doc(`${this.details.id}`).set(historyDocToAdd);
                //         }
                //     }
                // );
            },
            AddToWatchList() {
                firebase.auth().onAuthStateChanged(
                    async (user) => {
                        if (user) {
                            const userDbRef = db.collection('users').doc(user.uid);
                            const historyDocToAdd = {
                                ...omit(this.details, HISTORY_OMIT_VALUES),
                                updatedAt: Date.now(),
                            }
                            userDbRef.collection('seriesWatchList').doc(`${this.details.id}`).set(historyDocToAdd);
                        }
                    }
                );
            },
            getYoutubeVideos: function(videos: Array<Object>) {
                return _.filter(videos, {site: 'YouTube'});
            },
            selectVideo(video: Object) {
                this.selectedVideo = video;
            },
            getYear: function(movieDate: any) {
                return new Date(movieDate).getFullYear();
            },
            getRatingColor: function(rating: number) {
                if (rating < 5)
                    return 'red';
                if (rating < 6.5)
                    return 'orange';
                if (rating < 8)
                    return 'green';
                else
                    return 'purple';
            },
        },
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .season-container {
        background-color: rgba(148, 148, 148, 0.05);
    }
    @media (max-width: 767px) {
        .background-images-container {
            height: 20em !important;
            font-size: 0.8em !important;
        }.background-image {
            height: 20em !important;
        }
        .youtube-player {
            height: 100 !important;
            width: 100 !important;
        }
        .info-container {
            top: 1em;
            display: grid;
            grid-auto-rows: max(3em);
        }
        .info-container > div {
            margin: 0 !important;
            padding: 0 !important;
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
        }
    }
    .background-images-container {
        filter: opacity(0.3);
        height: 30em;
        overflow: hidden;
    }
    .background-image {
        background-size: contain;
        height: 30em;
        object-fit: cover;
        object-position: 50% 5%;
        width: 100%;
        overflow: hidden;
        box-shadow: 0px 0px 200px 100px rgba(0, 0, 0, 1);
    }
    .video-dropdown {
        margin-top: 0.6em;
        background: #111;
        border-color: #111;
        color: #ccc;
        width: 100%;
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
    .info-container {
        position: absolute;
        top: 2em;
        padding-left: 2em !important;
        overflow: hidden;
        color: @text-color;
    }
    .secondary-info {
        color: #aaa;
    }
    .ext-link-icon {
        font-size: 1.2em;
        color: @link-color-red;
    }
    .movie-overview {
        background: @translucent-bg;
        width: 60%;
        margin-top: 1em;
    }
    .info-tagline {
        color: #ddd !important;
        font-size: .5em;
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
        display:flex;
        justify-content:center;
    }
    /deep/ .el-dialog__body {
        padding-top: 0;
    }
</style>
