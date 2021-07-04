<template>
    <div style="position:relative;">
        <div class="background-images-container" v-loading="detailsLoading">
            <img v-lazy="creditImageBasePath + details.backdrop_path" class="background-image"/>
        </div>
        <div class="info-container ml-4" v-if="details.title">
            <h3 class="info-heading ml-3">
                <span class="shadow-text">{{details.title}}</span>
            </h3>

            <!-- Date and Genres -->
            <h6 class="secondary-info ml-3">
                <span v-if="details.release_date">{{getDateText(details.release_date)}} -</span>
                <span v-for="(genre, index) in details.genres" :key="index">
                    {{genre.name}}{{index===details.genres.length-1?'':','}}
                </span>
            </h6>

            <!-- Rating images and runtime -->
            <h6 class="secondary-info ml-3">
                <span v-if="details.runtime">{{getRuntime(details.runtime)}}</span>
                <span v-if="rating" :class="details.runtime?'ml-2':''">{{rating}} </span>
                <span class="ml-2" @click="openImageModal">
                    <font-awesome-icon :icon="['fas', 'images']"/>
                </span>
            </h6>
            <!-- Watch links -->
            <div class="ext-links-container ml-3 mt-4">
                <a v-for="watchOption in googleData.allWatchOptions" :key="watchOption.name" :href="watchOption.link" target="_blank">
                    <div class="ott-container mr-3">
                        <img :src="watchOption.imagePath" class="ott-icon"/>
                        <div>Watch Now</div>
                    </div>
                </a>

                <a v-if="!googleData.allWatchOptions.length && googleData.watchLink" :href="googleData.watchLink" target="_blank" class="mr-3">
                    <div class="ott-container">
                        <img :src="googleData.imagePath" class="ott-icon"/>
                        <div>Watch Now</div>
                    </div>
                </a>
                <div v-else style="height: 7em">
                </div>
            </div>
            <br/>
            <!-- External links -->
            <div class="mt-1 ml-3 shadow-text">
                <!-- <a :href="googleLink" target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                </a>&nbsp; -->
                <a :href="`https://www.iptorrents.com/t?q=${details.title};o=seeders#torrents`"
                    target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fas', 'magnet']" class="ext-link-icon"/>
                </a>&nbsp;
                <!-- <a v-if="details.imdb_id" :href="`https://www.imdb.com/title/${details.imdb_id}`"
                    target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fab', 'imdb']" class="ext-link-icon"/>
                </a>&nbsp; -->
                <a v-if="details.imdb_id" :href="`https://www.imdb.com/title/${details.imdb_id}/parentalguide`"
                    target="_blank" class="mr-3">
                    <font-awesome-icon :icon="['fas', 'exclamation-circle']" class="ext-link-icon"/>
                </a>&nbsp;
                <a v-if="details && details.homepage" :href="details.homepage" target="_blank" class="mr-3">
                    <font-awesome-icon icon="external-link-square-alt" class="ext-link-icon"/>
                </a>
            </div>

            <!-- Rating -->
            <div class="mt-4 pt-2 ratings-main-container">
                <!-- <el-tooltip class="item" effect="light" :content="`${details.vote_count} ratings`"
                    placement="top">
                    <div class="rating-info mr-4" :style="`border-color: ${getRatingColor(details.vote_average)};
                        color: ${getRatingColor(details.vote_average)}`">
                        {{details.vote_average}}
                    </div>
                </el-tooltip> -->
                <!-- <div class="vote-count ml-2">{{details.vote_count}} <i class="el-icon-star-off"></i></div> -->
                <div class="rating-container">
                    <a href="" target="_blank">
                        <img src="/images/rating/tmdb.svg"/><br/>
                        <span>{{details.vote_average}}/10</span>
                    </a>
                </div>
                <div class="rating-container" v-for="rating in googleData.ratings" :key="rating[1]">
                    <a :href="rating.link" target="_blank">
                        <img :src="rating.imagePath"/><br/>
                        <span>{{rating.rating}}</span>
                    </a>
                </div>
            </div>

            <!-- bookmarks -->
            <div class="mt-3 pt-4 bookmarks">
                <el-tooltip class="item" effect="light" :content="user.displayName?isWatched?
                    'Youve watched this':'Watched this?':'Sign in to use this feature'"
                    placement="top">
                    <span :class="`rating-info watch-check ${isWatched?'watched-item':''}`" @click="watchedClicked">
                        <font-awesome-icon :icon="['fas', 'check']"/>
                    </span>
                </el-tooltip>
                <el-tooltip class="item" effect="light" :content="user.displayName?isInWatchList?
                    'Remove from watch list':'Add to watch list':'Sign in to use this feature'"
                    placement="top">
                    <span :class="`rating-info watch-check ${isInWatchList?'watched-item':''}`" @click="addToListClicked">
                        <font-awesome-icon :icon="['fas', 'plus']"/>
                    </span>
                </el-tooltip>
            </div>

            <!-- budget -->
            <!-- <div style="top: 31em; position: absolute;" class="budget-text mobile-hide">
                <font-awesome-icon :icon="['fas', 'dollar-sign']" class="budget-icon"/>
                {{getCurrencyString(details.budget)}}
                <font-awesome-icon :icon="['fas', 'chart-line']" :class="`${budgetColor} budget-icon`"/>
                <span :class="budgetColor">{{getCurrencyString(details.revenue)}}</span>
            </div> -->

            <!-- Movie overview -->
            <div class="frosted movie-overview p-2 mobile-hide">
                <span v-if="showFullOverview">{{details.overview}}</span>
                <span v-if="!showFullOverview">{{details.overview.slice(0, 200)}}</span>
                <span v-if="details.overview.length > 200" class="expand-ellipsis ml-3" @click="showFullOverview = !showFullOverview">...</span>
                <div>
                    <router-link v-for="keyword in details.keywords.keywords" :key="keyword.id" class="mr-2"
                        :to="{
                            name: 'discover',
                            query:
                                {
                                    keywords: keyword.name,
                                    with_keywords: keyword.id
                                }
                            }">
                        <el-tag type="info" size="mini">
                            {{keyword.name}}
                        </el-tag>
                    </router-link>
                </div>
            </div>
        </div>
        <!-- Trailer/Video -->
        <div v-if="getYoutubeVideos().length" style="position: absolute; top: 5em; right: 3em;" class="mobile-hide">
            <iframe id="ytplayer" type="text/html" :width="isMobile?200:640" :height="isMobile?120:360" class="youtube-player"
                :src="`https://www.youtube.com/embed/${selectedVideo.key || getYoutubeVideos()[0].key}`"
                frameborder="0" iv_load_policy="3" fs="1" allowfullscreen="true" autoplay="1"
                style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0,0,0,0.75);">
            </iframe>
            <div class="dropdown">
                <button class="btn dropdown-toggle video-dropdown btn-dark m-0"
                    type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    {{selectedVideo.name || getYoutubeVideos()[0].name}}
                </button>
                <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                    <a class="dropdown-item" v-for="video in getYoutubeVideos()" :key="video.key"
                        v-on:click="selectVideo(video)">{{video.name}}</a>
                </div>
            </div>
        </div>
        <div class="ml-4 mr-4 sliders-container">
            <div v-if="details.collectionDetails">
                <mb-slider :items="details.collectionDetails.parts" :configuration="configuration" :heading="details.collectionDetails.name"
                    :id="details.collectionDetails.name" :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></mb-slider>
            </div>
            <mb-slider v-if="cast.length" :items="cast" :configuration="configuration" :heading="'Cast'" :id="'cast'"
                :selectPerson="selectPerson" :isPerson="true"></mb-slider>
            <mb-slider v-if="crew.length" :items="crew" :configuration="configuration" :heading="'Crew'" :id="'crew'"
                :selectPerson="selectPerson" :isPerson="true"></mb-slider>

            <mb-slider v-if="similarMovies.length" :items="similarMovies" :configuration="configuration" :heading="'Similar'" :id="'similar'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></mb-slider>
            <mb-slider v-if="recommendedMovies.length" :items="recommendedMovies" :configuration="configuration" :heading="'Recommended'" :id="'recommended'"
                :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></mb-slider>
            <div class="mb-5"></div>
        </div>
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
    import { getCurrencyString, getDateText, mapGoogleData } from '../../Common/utils';
    import { db } from '../../Common/firebase';
    import { omit, sortBy } from 'lodash';
    import { HISTORY_OMIT_VALUES } from '../../Common/constants';

    export default {
        name: 'movieInfo',
        props: [
            'configuration',
            'showMovieInfo',
            'selectPerson',
            'showFullMovieInfo',
        ],
        data() {
          return {
            details: {} as any,
            creditImageBasePath: this.configuration.images.secure_base_url + 'h632',
            detailsLoading: true,
            activeName: 'movies',
            showFullBio: false,
            movie: {},
            recommendedMovies: [] as any[],
            similarMovies: [] as any[],
            cast: [] as any[],
            crew: [] as any[],
            selectedVideo: {},
            showFullOverview: false,
            dialogVisible: false,
            backdrops: [] as any[],
            posters: [] as any[],
            googleData: {
                allWatchOptions: [],
            },
            rating: null,
            defaultImageTab: 'backdrops',
            getCurrencyString,
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
        methods: {
            getRuntime(runtime) {
                let hours = 0;
                if ((runtime/60) >= 1) {
                    hours = Math.trunc(runtime/60);
                }
                return `${hours? Math.trunc(hours) + 'h ':''}${runtime%60} m`;
            },
            watchedClicked() {
                if (!this.user.displayName) {
                    return;
                }
                const userDbRef = db.collection('users').doc(this.user.uid);
                if (this.isWatched) {
                    userDbRef.collection('watchedMovies').doc(`${this.details.id}`).delete();
                } else {
                    userDbRef.collection('watchedMovies').doc(`${this.details.id}`).set({
                        ...omit(this.details, HISTORY_OMIT_VALUES),
                        updatedAt: Date.now(),
                    });
                }
            },
            addToListClicked() {
                if (!this.user.displayName) {
                    return;
                }
                const userDbRef = db.collection('users').doc(this.user.uid);
                if (this.isInWatchList) {
                    userDbRef.collection('moviesWatchList').doc(`${this.details.id}`).delete();
                } else {
                    userDbRef.collection('moviesWatchList').doc(`${this.details.id}`).set({
                        ...omit(this.details, HISTORY_OMIT_VALUES),
                        updatedAt: Date.now(),
                    });
                }
            },
            openImageModal() {
                this.dialogVisible = true;
                this.backdrops = this.details.images.backdrops;
                this.posters = this.details.images.posters;
            },
            async getDetails() {
                this.detailsLoading = true;
                this.googleData = {
                    allWatchOptions: [],
                };
                this.details = await api.getMovieDetails(parseInt(this.$route.params.id));
                if (this.details.belongs_to_collection) {
                    this.details.collectionDetails = await api.collectionDetails(
                        parseInt(this.details.belongs_to_collection.id));
                }
                this.updateHistoryData();
                this.similarMovies = this.details.similar.results;
                this.recommendedMovies = this.details.recommendations.results;
                this.cast = this.details.credits.cast;
                this.crew = sortBy(this.details.credits.crew,
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
                this.crew = sortBy(this.crew,
                    ({profile_path}) => {
                        return profile_path ? 0 : 1;
                    }
                );
                this.detailsLoading = false;
                this.getRating();
            },
            async getRating() {
                const {results: releaseDates} = await api.releaseDates(this.details.id);
                const usRating = releaseDates.find(({iso_3166_1}) => iso_3166_1 === 'US');
                if (usRating) {
                    this.rating = usRating.release_dates[0].certification;
                }
                const googleData = await api.getOTTLink(encodeURIComponent(this.googleLink.replace('&', '')));
                this.googleData = mapGoogleData(googleData);
            },
            async updateHistoryData() {
                // firebase.auth().onAuthStateChanged(
                //     async (user) => {
                //         if (user) {
                //             const userDbRef = db.collection('users').doc(user.uid);
                //             const userMovieHistory = await userDbRef.collection('moviesHistory').get();
                //             const historyDocToAdd = {
                //                 ...omit(this.details, HISTORY_OMIT_VALUES),
                //                 updatedAt: Date.now(),
                //             }
                //             userDbRef.collection('moviesHistory').doc(`${this.details.id}`).set(historyDocToAdd);
                //         }
                //     }
                // );
            },
            getYoutubeVideos: function() {
                if (this.details.videos && this.details.videos.results) {
                    return this.details.videos.results.filter(result => result.site === 'YouTube');
                } else {
                    return [];
                }
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
        computed: {
            googleLink() {
                return `https://google.com/search?q=${this.details.title} ${this.getYear(this.details.release_date)} movie`;
            },
            budgetColor() {
                if (this.details.budget && this.details.revenue) {
                    if (this.details.budget > this.details.revenue) {
                        return 'budget-loss';
                    } else {
                        return 'budget-profit'
                    }
                }
            },
            user() {
                return this.$store.getters.user;
            },
            isWatched() {
                return this.$store.getters.watchedMovieById(this.details.id);
            },
            isInWatchList() {
                return this.$store.getters.watchListMovieById(this.details.id);
            },
            isMobile() {
                return window.innerWidth < 768?true:false;
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .vote-count {
        font-size: 0.8em;
        padding-left: 0.5em;
        color: whitesmoke;
        text-shadow: 1px 1px 2px black;
        text-align: center;
        line-height: 4em;
    }
    .ott-icon {
        width: 3em;
    }
    .background-images-container {
        filter: opacity(0.3);
        height: 35em;
        overflow: hidden;
    }
    .background-image {
        background-size: contain;
        height: 35em;
        object-fit: cover;
        object-position: 50% 10%;
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
        height: 33em;
    }
    .secondary-info {
        color: #aaa;
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
    .ratings-main-container {
        display: flex;
    }
    .ext-link-icon {
        font-size: 1.2em;
        color: @link-color-red;
    }
    .movie-overview {
        background: @translucent-bg;
        width: 60%;
        margin-top: 5em;
        bottom: 0.5em;
        position: absolute;
    }
    ::v-deep .el-tabs__header {
        padding: 0 2em !important;
    }
    ::v-deep .el-tabs__nav-wrap::after {
        height: 0;
    }
    .cursor-pointer {
        cursor: pointer;
    }
    .justify-center {
        display:flex;
        justify-content:center;
    }
    .info-tagline {
        padding-left: 1em;
        color: #ddd !important;
        font-size: .5em;
    }
    /deep/ .el-dialog__body {
        padding-top: 0;
    }
    .budget-icon {
        width: 2em;
    }
    .budget-loss {
        color: red;
    }
    .budget-profit {
        color: green;
    }
    .budget-text {
        font-weight: 500;
        background-color: rgba(0, 0, 0, 0.4);
        border-radius: 3px;
        padding: 0.4em;
        font-size: 0.8em;
    }
    .watch-check {
        font-size: 1em;
        margin-left: 0.5em;
        cursor: pointer;
    }
    .watched-item {
        border-color: green;
        color: green;
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
            margin: 0 !important;
            padding-left: 0.5em !important;
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
            position: absolute;
            top: 12rem;
            right: 2em;
            span {
                margin-left: 1em;
            }
        }
        .secondary-info {
            font-size: 0.9em;
        }
        .sliders-container {
            margin: 0.5em !important;
        }
    }
</style>
