<template>
    <div style="position:relative;">
        <div class="background-images-container" v-loading="detailsLoading">
            <img v-lazy="creditImageBasePath + details.backdropPath" class="background-image"/>
        </div>
        <div class="info-container" v-if="details.name">
            <h3 div="info-heading">
                {{details.name}}
                <span>
                    <span class="text-muted info-tagline cursor-pointer" @click="openImageModal">
                        <font-awesome-icon :icon="['fas', 'images']"/>
                    </span>
                </span>
            </h3>

            <!-- Date and Genres -->
            <h6 class="secondary-info" style="margin-bottom: 1.5em;">
                {{getDate(details.releaseDate)}} -
                <span v-for="(genre, index) in details.genres" :key="index">
                    {{genre.name}}{{index===details.genres.length-1?'':','}}
                </span>
            </h6>

            <!-- External links -->
            <div class="ext-links-container">
                <a :href="`https://google.com/search?q=${details.name} ${getYear(details.releaseDate)} movie`"
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
            <div class="mt-5 pt-5">
                <span class="rating-info" :style="`border-color: ${getRatingColor(details.rating)}; color: ${getRatingColor(details.rating)}`">
                    {{details.rating}}
                </span>
            </div>

            <!-- Movie overview -->
            <div class="movie-overview p-2">
                <span v-if="showFullOverview">{{details.overview}}</span>
                <span v-if="!showFullOverview">{{details.overview.slice(0, 200)}}</span>
                <span v-if="details.overview.length > 200" class="expand-ellipsis ml-3" @click="showFullOverview = !showFullOverview">...</span>
            </div>
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
        <!-- Trailer/Video -->
        <div v-if="getYoutubeVideos(details.videos).length"
            style="position: absolute; top: 3em; right: 3em;">
            <iframe id="ytplayer" type="text/html" width="640" height="360"
                :src="`https://www.youtube.com/embed/${selectedVideo.key || getYoutubeVideos(details.videos)[0].key}`"
                frameborder="0" iv_load_policy="3" fs="1" allowfullscreen="true" autoplay="1"
                style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0,0,0,0.75);">
            </iframe>
            <div class="dropdown">
                <button class="btn dropdown-toggle video-dropdown btn-dark m-0"
                    type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    {{selectedVideo.name || getYoutubeVideos(details.videos)[0].name}}
                </button>
                <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                    <a class="dropdown-item" v-for="video in details.videos" :key="video.key"
                        v-on:click="selectVideo(video)">{{video.name}}</a>
                </div>
            </div>
        </div>
        <person-slider v-if="cast.length" :persons="cast" :configuration="configuration" :heading="'Cast'" :id="'cast'"
            :selectPerson="selectPerson"></person-slider>
        <person-slider v-if="crew.length" :persons="crew" :configuration="configuration" :heading="'Crew'" :id="'crew'"
            :selectPerson="selectPerson"></person-slider>

        <movie-slider v-if="similarMovies.length" :movies="similarMovies" :configuration="configuration" :heading="'Similar'" :id="'similar'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
        <movie-slider v-if="recommendedMovies.length" :movies="recommendedMovies" :configuration="configuration" :heading="'Recommended'" :id="'recommended'"
            :showMovieInfoModal="showMovieInfo" :showFullMovieInfo="showFullMovieInfo"></movie-slider>
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
            defaultImageTab: 'backdrops',
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
            openImageModal() {
                this.dialogVisible = true;
                this.backdrops = this.details.images.backdrops;
                this.posters = this.details.images.posters;
            },
            async getDetails() {
                this.detailsLoading = true;
                this.details = await api.getMovieDetails(parseInt(this.$route.params.id));
                this.updateLocalStorage();
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
                this.detailsLoading = false;
            },
            updateLocalStorage() {
                pushItemByName('moviesHistory', this.details);
            },
            getDate(date: Date) {
                const monthNames = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                ];
                const dateObj = new Date(date);
                return `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
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
        color: #fff;
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
        margin-top: 5em;
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
</style>
