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
        <div class="all-info-container pl-5" v-if="details.title">
            <div class="heading-container">
                <h3 class="info-heading ml-3">
                    <span class="shadow-text">{{ details.title }}</span>
                </h3>
                <el-tag v-if="details.adult" type="danger">Adult</el-tag>
                <rank :item="details"></rank>
            </div>

            <!-- Date and Genres -->
            <h6 class="secondary-info ml-3">
                <span v-if="details.release_date">{{ getDateText(details.release_date) }} -</span>
                <span v-for="(genre, index) in details.genres" :key="index">
                    {{ genre.name }}{{ index === details.genres.length - 1 ? '' : ',' }}
                </span>
                <span class="desk-hide">
                    <br/>
                    <span v-if="details.runtime">{{ getRuntime(details.runtime) }}</span>
                    <span v-if="rating" :class="details.runtime ? 'ml-2' : ''">{{ rating }} </span>
                    <span class="ml-2" @click="openImageModal">
                        <font-awesome-icon :icon="['fas', 'images']" />
                    </span>
                </span>
            </h6>

            <!-- Rating images and runtime -->
            <h6 class="secondary-info ml-3 mobile-hide">
                <span v-if="details.runtime">{{ getRuntime(details.runtime) }}</span>
                <span v-if="rating" :class="details.runtime ? 'ml-2' : ''">{{ rating }} </span>
                <span class="ml-2 cursor-pointer" @click="openImageModal">
                    <font-awesome-icon :icon="['fas', 'images']" />
                </span>
            </h6>

            <!-- Watch links -->
            <GoogleData class="mt-5 googleData-container ml-3" :item="details" :key="details.id"
                :rawGoogleData="details.googleData" />

            <!-- budget -->
            <!-- <div style="top: 31em; position: absolute;" class="budget-text mobile-hide">
                <font-awesome-icon :icon="['fas', 'dollar-sign']" class="budget-icon"/>
                {{getCurrencyString(details.budget)}}
                <font-awesome-icon :icon="['fas', 'chart-line']" :class="`${budgetColor} budget-icon`"/>
                <span :class="budgetColor">{{getCurrencyString(details.revenue)}}</span>
            </div> -->

            <!-- Movie additional info -->
            <div class="additional-info">
                <!-- bookmarks -->
                <div class="mt-2 mb-3 pl-2 bookmarks">
                    <el-tooltip
                        class="item"
                        effect="light"
                        :content="
                            isSignedIn
                                ? isWatched
                                    ? 'Youve watched this'
                                    : 'Watched this?'
                                : 'Sign in to use this feature'
                        "
                        placement="top"
                    >
                        <span
                            :class="`rating-info mr-3 watch-check ${isWatched ? 'watched-item' : ''}`"
                            @click="watchedClicked"
                        >
                            <font-awesome-icon :icon="['fas', 'check']" />
                        </span>
                    </el-tooltip>
                    <el-tooltip
                        class="item"
                        effect="light"
                        :content="
                            isSignedIn
                                ? isInWatchList
                                    ? 'Remove from watch list'
                                    : 'Add to watch list'
                                : 'Sign in to use this feature'
                        "
                        placement="top"
                    >
                        <span
                            :class="`rating-info mr-3 watch-check ${isInWatchList ? 'watched-item' : ''}`"
                            @click="addToListClicked"
                        >
                            <font-awesome-icon :icon="['fas', 'plus']" />
                        </span>
                    </el-tooltip>
                </div>
            </div>
        </div>
        <div class="ml-4 mr-4 sliders-container">
            <!-- overview -->
            <div class="overview-container">
                <div class="overview-heading">
                    <h4>Overview</h4>
                    <a
                        v-if="details.imdb_id"
                        :href="`https://www.imdb.com/title/${details.imdb_id}/parentalguide`"
                        target="_blank"
                        class="mr-4"
                    >
                    <div class="parental-guide">
                        Parental Guide
                        <i class="el-icon-top-right"></i>
                    </div>
                    </a>
                </div>
                <div class="pt-3 overview">
                    {{ details.overview }}
                </div>
                <rtReviews :item="details"></rtReviews>
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
                    <a @click="requestUpdate" class="ml-3" :disable="isUpdating">request update</a>
                </div>
            </div>
            <div v-if="details.collectionDetails">
                <mb-slider
                    :items="details.collectionDetails.parts"
                    :configuration="configuration"
                    :heading="details.collectionDetails.name"
                    :id="details.collectionDetails.name"
                    :showMovieInfoModal="showMovieInfo"
                    :showFullMovieInfo="showFullMovieInfo"
                ></mb-slider>
            </div>
            <mb-slider
                v-if="cast.length"
                :items="cast"
                :configuration="configuration"
                :heading="'Cast'"
                :id="'cast'"
                :selectPerson="selectPerson"
                :isPerson="true"
            ></mb-slider>
            <!-- <div
                class="ml-4 p-3 mr-4 mt-3 mb-3 frosted reviews-main-container"
                style="background: rgba(50, 50, 50, 0.3)"
                v-if="googleData.criticReviews && googleData.criticReviews.length"
            >
                <h5 class="mb-5">Critic Reviews</h5>
                <div class="reviews-container mb-5">
                    <div v-for="review in googleData.criticReviews" :key="review.author" class="mr-5">
                        <a :href="review.link" target="_blank">
                            <img :src="review.imagePath" class="review-image" />
                            <span class="ml-3">{{ review.site }}</span>
                            <span v-if="review.author"> - {{ review.author }}</span>
                            <div class="mt-2 ml-5 secondary-info">{{ review.review }}</div>
                        </a>
                    </div>
                </div>
            </div> -->
            <mb-slider
                v-if="crew.length"
                :items="crew"
                :configuration="configuration"
                :heading="'Crew'"
                :id="'crew'"
                :selectPerson="selectPerson"
                :isPerson="true"
            ></mb-slider>

            <mb-slider
                v-if="recommendedMovies.length"
                :items="recommendedMovies"
                :configuration="configuration"
                :heading="'Recommended'"
                :id="'recommended'"
                :showMovieInfoModal="showMovieInfo"
                :showFullMovieInfo="showFullMovieInfo"
            ></mb-slider>
            <mb-slider
                v-if="similarMovies.length"
                :items="similarMovies"
                :configuration="configuration"
                :heading="'Similar'"
                :id="'similar'"
                :showMovieInfoModal="showMovieInfo"
                :showFullMovieInfo="showFullMovieInfo"
            ></mb-slider>
            <div class="mb-5"></div>
        </div>
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
import { getCurrencyString, getDateText } from '../../Common/utils';
import { sortBy } from 'lodash';
import GoogleData from '../Common/googleData.vue';
import { mapActions } from 'vuex';
import moment from 'moment';
import rank from '@/components/Common/rank.vue';
import rtReviews from '@/components/Common/rottenTomatoesReviews.vue';

export default {
    name: 'movieInfo',
    props: ['configuration', 'showMovieInfo', 'selectPerson', 'showFullMovieInfo'],
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
            isUpdating: false,
            videoTimeout: null,
            showFullBio: false,
            movie: {},
            recommendedMovies: [] as any[],
            similarMovies: [] as any[],
            cast: [] as any[],
            crew: [] as any[],
            selectedVideo: {},
            showFullOverview: false,
            showAllTags: false,
            dialogVisible: false,
            backdrops: [] as any[],
            posters: [] as any[],
            rating: null,
            defaultImageTab: 'backdrops',
            getCurrencyString,
            getDateText,
        };
    },
    created() {
        $("#myvideo").on("mouseenter", () => {
            $(this).attr("controls", "");
        });
        $("#myvideo").on("mouseleave", () => {
            $(this).removeAttr("controls");
        });
        this.getDetails();
    },
    watch: {
        '$route.params.id': function () {
            this.getDetails();
        },
    },
    methods: {
        sincetime(time) {
            return moment(time).fromNow();
        },
        async requestUpdate() {
            this.detailsLoading = true;
            try {
                this.details = await api.getMovieDetails(this.details.id, 'force=true');
            } catch(e) {} finally {
                this.detailsLoading = false;
            }
        },
        ...mapActions({
            deleteWatched: 'delteWatchedMovie',
            addWatchedMovie: 'addWatchedMovie',
            addWatchListMovie: 'addWatchListMovie',
            delteWatchListMovie: 'delteWatchListMovie',
            addRecent: 'addRecent',
        }),
        getRuntime(runtime) {
            let hours = 0;
            if (runtime / 60 >= 1) {
                hours = Math.trunc(runtime / 60);
            }
            return `${hours ? Math.trunc(hours) + 'h ' : ''}${runtime % 60} m`;
        },
        watchedClicked() {
            if (this.isWatched) {
                this.deleteWatched(this.details.id);
            } else {
                this.addWatchedMovie(this.details.id)
            }
        },
        addToListClicked() {
            if (this.isInWatchList) {
                this.delteWatchListMovie(this.details.id);
            } else {
                this.addWatchListMovie(this.details.id)
            }
        },
        openImageModal() {
            this.dialogVisible = true;
            this.backdrops = this.details.images.backdrops;
            this.posters = this.details.images.posters;
        },
        async getDetails() {
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            this.detailsLoading = true;
            this.details = await api.getMovieDetails(parseInt(this.$route.params.id));
            if (!this.details.adult) {
                this.updateHistoryData();
            }
            this.similarMovies = this.details.similar.results;
            this.recommendedMovies = this.details.recommendations.results;
            this.cast = this.details.credits.cast;
            this.crew = sortBy(this.details.credits.crew, (person) => {
                if (person.job === 'Director') return 0;
                if (person.department === 'Directing') return 1;
                if (person.department === 'Writing') return 2;
                if (person.department === 'Production') return 3;
                if (person.department === 'Camera') return 4;
                return 100;
            });
            this.crew = sortBy(this.crew, ({ profile_path }) => {
                return profile_path ? 0 : 1;
            });
            this.detailsLoading = false;
            this.getRating();
            this.showVideo = false;
        },
        async getRating() {
            const { results: releaseDates } = await api.releaseDates(this.details.id);
            const usRating = releaseDates.find(({ iso_3166_1 }) => iso_3166_1 === 'US');
            if (usRating) {
                this.rating = usRating.release_dates[0].certification;
            }
        },
        async updateHistoryData() {
            this.addRecent({id: this.details.id, isMovie: true, item: this.details})
        },
        getYoutubeVideos: function () {
            if (this.details.videos && this.details.videos.results) {
                let youtubeVideos = this.details.videos.results.filter((result) => result.site === 'YouTube');
                youtubeVideos = sortBy(youtubeVideos, (video) => video.type === 'Trailer').reverse();
                return youtubeVideos;
            } else {
                return [];
            }
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
    computed: {
        keywords() {
            return this.details?.keywords?.keywords || [];
        },
        isSignedIn() {
            return this.$store.getters.isSignedIn;
        },
        googleLink() {
            return `https://google.com/search?q=${this.details.title} ${this.getYear(this.details.release_date)} movie`;
        },
        budgetColor() {
            if (this.details.budget && this.details.revenue) {
                if (this.details.budget > this.details.revenue) {
                    return 'budget-loss';
                } else {
                    return 'budget-profit';
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
            return window.innerWidth < 768 ? true : false;
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
@primary-container-height: max(50vh, 35rem);
@all-info-container: calc(max(50vh, 35rem) - 2rem);
.heading-container {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.additional-info {
    width: 60%;
    margin-top: 2rem;
    margin-left: 1rem;
    bottom: 1rem;
    position: absolute;
}
.watch-price {
    font-size: 0.7rem;
    color: #aaa;
}
.review-image {
    border-radius: 50%;
    width: 2em;
    height: 2em;
    background: white;
    padding: 0.2em;
}
.reviews-container {
    display: flex;
    > div {
        width: 35em;
    }
}
.vote-count {
    font-size: 0.8em;
    padding-left: 0.5em;
    color: whitesmoke;
    text-shadow: 1px 1px 2px black;
    text-align: center;
    line-height: 4em;
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
        z-index: 10000000000000000;
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
    padding-left: 3.5rem !important;
    overflow: hidden;
    color: @text-color;
    height: @all-info-container;
    width: 25%;
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
    width: 90%;
    background: @translucent-bg;
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
    display: flex;
    justify-content: center;
}
.info-tagline {
    padding-left: 1em;
    color: #ddd !important;
    font-size: 0.5em;
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
    cursor: pointer;
}
.watched-item {
    border-color: green;
    color: green;
}
@media (max-width: 767px) {
    .additional-info {
        position: absolute;
        bottom: 7rem;
        left: 1rem;
    }
    .background-images-container {
        height: calc(100vh/2) !important;
        font-size: 0.8em !important;
    }
    .background-image {
        height: calc(100vh/2) !important;
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
        width: 100%;
        padding-left: 0.5em !important;
    }
    .all-info-container > div {
        margin: 0;
        padding: 0 !important;
    }
    .googleData-container {
        margin-top: 2rem !important;
        margin-left: 0 !important;
        z-index: 1000000000000;
    }
    .rating-info {
        font-size: 1em;
    }
    .budget-text {
        position: relative !important;
        top: 0 !important;
    }
    .secondary-info {
        font-size: 0.9em;
    }
    .sliders-container {
        margin: 0.5em !important;
    }
    .reviews-container {
        flex-direction: column;
        margin-bottom: 0 !important;
        > div {
            width: 100%;
            padding-bottom: 1em;
        }
    }
    .reviews-main-container {
        margin: 0.5em !important;
    }
}
</style>
