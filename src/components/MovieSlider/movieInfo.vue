<template>
    <div class="info-container" :id="movie.id">
        <div class="backdrop">
            <div class="info-main">
                <h3 div="info-heading" v-if="isLoaded">
                    {{movie.movieDetails.name}}
                    <span class="text-muted info-tagline">
                        {{movie.movieDetails.tagline}}
                    </span>
                </h3>
                <font-awesome-icon icon="window-close" size="2x" :mask="['far', 'circle']" class="close-icon text-danger"
                    v-on:click="closeInfo"/>

                <!-- Date and Genres -->
                <h6 class="text-muted" style="margin-bottom: 1.5em;" v-if="isLoaded">
                    {{getDate(movie.movieDetails.releaseDate)}} -
                    <span v-for="(genre, index) in movie.movieDetails.genres" :key="index">
                        {{genre.name}}{{index===movie.movieDetails.genres.length-1?'':','}}
                    </span>
                </h6>

                <!-- External links -->
                <a :href="`https://google.com/search?q=${movie.movieDetails.name} ${getYear(movie.movieDetails.releaseDate)} movie`" target="_blank" v-if="isLoaded">
                    <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                </a>&nbsp;
                <a v-if="movie.movieDetails && movie.movieDetails.homepage" :href="movie.movieDetails.homepage" target="_blank">
                    <font-awesome-icon icon="external-link-square-alt" class="ext-link-icon"/>
                </a>

                <!-- Rating -->
                <div v-if="isLoaded" style="margin-top: 2em;">
                    <span class="rating-info" :style="`border-color: ${getRatingColor(movie.vote_average)}; color: ${getRatingColor(movie.vote_average)}`">
                        {{movie.vote_average}}
                    </span>
                </div>

                <!-- Trailer/Video -->
                <div v-if="isLoaded && getYoutubeVideos(movie.movieDetails.videos).length"
                    style="position: absolute; top: 7em; right: 3em;">
                    <iframe id="ytplayer" type="text/html" width="640" height="360"
                        :src="`https://www.youtube.com/embed/${selectedVideo.key || getYoutubeVideos(movie.movieDetails.videos)[0].key}`"
                        frameborder="0" iv_load_policy="3" fs="1" allowfullscreen="true" autoplay="1"
                        style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0,0,0,0.75);">
                    </iframe>
                    <div class="dropdown">
                        <button class="btn dropdown-toggle video-dropdown btn-dark m-0"
                            type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            {{selectedVideo.name || getYoutubeVideos(movie.movieDetails.videos)[0].name}}
                        </button>
                        <div class="dropdown-menu dropdown-menu-middle" aria-labelledby="dropdownMenuButton">
                            <a class="dropdown-item" v-for="video in movie.movieDetails.videos" :key="video.key"
                                v-on:click="selectVideo(video)">{{video.name}}</a>
                        </div>
                    </div>
                </div>

                <!-- Directors -->
                <div v-if="isLoaded && movie.media_type !== 'tv'">
                    <h5 style="margin-top: 2em; margin-bottom: -0.6em;">Director{{getDirectors(movie.movieDetails.credits.crew).length > 1?'s':''}}</h5>
                    <div class="credits-container">
                        <div  v-for="director in getDirectors(movie.movieDetails.credits.crew)" :key="director.name">
                            <div class="credit-item" v-on:click="googleCredit(director.name)">
                                <img v-lazy="director.profile_path?creditImageBasePath + director.profile_path:'https://via.placeholder.com/150/000/000?'" class="credit-img"
                                    :title="`${director.name}`"/>
                                <div class="credit-description">
                                    {{director.name}}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Creators -->
                <div v-if="isLoaded && movie.media_type === 'tv'">
                    <h5 style="margin-top: 4em; margin-bottom: -0.6em;">Creator{{movie.movieDetails.creators.length > 1?'s':''}}</h5>
                    <div class="credits-container">
                        <div  v-for="director in movie.movieDetails.creators" :key="director.name">
                            <div class="credit-item" v-on:click="googleCredit(director.name)">
                                <img v-lazy="director.profile_path?creditImageBasePath + director.profile_path:'https://via.placeholder.com/150/000/000?'" class="credit-img"
                                    :title="`${director.name}`"/>
                                <div class="credit-description">
                                    {{director.name}}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Cast -->
                <h5 style="margin-top: 3em; margin-bottom: -0.6em;">Cast</h5>
                <div class="credits-container" v-if="isLoaded">
                    <div v-for="actor in movie.movieDetails.credits.cast.slice(0, 10)" :key="actor.name" v-if="actor.profile_path">
                        <div class="credit-item" v-on:click="googleCredit(actor.name)">
                            <img v-lazy="creditImageBasePath + actor.profile_path" class="credit-img"
                                :title="`${actor.name} - ${actor.character}`"/>
                            <div class="credit-description">
                                {{actor.name}}
                                <div class="text-muted">{{actor.character}}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Absolute Footer -->
                <div class="info-description">
                    <p class="info-text-dark">
                        {{movie.overview}}
                    </p>
                    <!-- <h5 class="text-muted info-text-light company-info" v-if="isLoaded">
                        <span v-for="company in movie.movieDetails.productionCompanies" :key="company.name">
                            <img v-lazy="logoImageBasePath + company.logo_path" class="logo-img"
                                :title="`${company.name}${company.origin_country?' - ' + company.origin_country:''}`"/>
                        </span>
                    </h5> -->
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    export default {
        name: 'movieInfo',
        props: ['movie', 'configuration', 'imageRes', 'closeInfo'],
        data() {
            return {
                originalimageBasePath: this.configuration.images.secure_base_url + 'w1280',
                logoImageBasePath: this.configuration.images.secure_base_url + 'w300',
                creditImageBasePath: this.configuration.images.secure_base_url + 'h632',
                isLoaded: false,
                selectedVideo: {},
                bgInterval: null,
                bgIndex: 0,
                bgStyle: `linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.6))`,
                backroundImageObj: {
                    src: '',
                    error: 'https://via.placeholder.com/150/222222/222222',
                    loading: 'https://via.placeholder.com/150/222222/222222'
                },
            };
        },
        mounted() {
            this.updateBgImage();
        },
        watch: {
            movie: function (newMovie, oldMovie) {
                this.selectedVideo = {};
                this.isLoaded = false;
                this.bgIndex = 0;
                this.updateBgImage();
                if (this.bgInterval)
                    clearInterval(this.bgInterval);
                this.getMovieInfo();
            }
        },
        beforeDestroy() {
            clearInterval(this.bgInterval);
        },
        methods: {
            updateBgImage() {
                const self = this;
                setTimeout(() => {
                        $(`#${self.movie.id} .backdrop`).css('background-image',
                            `${this.bgStyle},
                            url(${self.originalimageBasePath + self.movie.backdrop_path})`);
                    }, 300
                );
            },
            sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            },
            cycleBgs() {
                if (this.bgInterval)
                    clearInterval(this.bgInterval);
                const self = this;
                this.bgInterval = setInterval(() => {
                    let nextIndex = this.bgIndex++;
                    if (this.movie.movieDetails.images.backdrops.length === this.bgIndex) {
                        this.bgIndex = 0;
                    }
                    $(`#${this.movie.id} .backdrop`).css('background-image',
                        `${this.bgStyle},
                        url(${this.originalimageBasePath + this.movie.movieDetails.images.backdrops[this.bgIndex].file_path})`);
                }, 10000)
            },
            getMovieInfo: async function() {
                let movieDetails;
                let movieCredits;
                if (this.movie.media_type === 'tv') {
                    movieDetails = await api.getTvDetails(this.movie.id);
                } else {
                    movieDetails = await api.getMovieDetails(this.movie.id);
                }
                this.movie.movieDetails = movieDetails;
                this.isLoaded = true;
                this.cycleBgs();
            },
            getDate: function(movieDate: any) {
                const monthNames = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                ];
                const date = new Date(movieDate)
                return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
            },
            getYear: function(movieDate: any) {
                return new Date(movieDate).getFullYear();
            },
            getDirectors: function(crew: any) {
                return _.filter(crew, {job: 'Director'});
            },
            googleCredit: function(name: String) {
                window.open(`https://google.com/search?q=${name}`, '_blank');
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
            getYoutubeVideos: function(videos: Array<Object>) {
                return _.filter(videos, {site: 'YouTube'});
            },
            selectVideo(video: Object) {
                this.selectedVideo = video;
            }
        }
    }
</script>

<style scoped>
    .info-container {
        padding: 2em 2.5em 0em 2.5em;
        height: 54em;
        position: relative;
        width: 95%;
        scroll-behavior: smooth;
    }
    .dropdown-menu-middle {
        width: 100%;
    }
    .backdrop {
        position: absolute;
        width: 100%;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: 100% 0%;
        height: 100%;
        color: white;
        padding: 1em;
        background-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.4));
    }
    .info-description {
        position: absolute;
        bottom: 0;
        width: 100%;
    }
    .info-text-dark {
        background: rgba(0, 0, 0, 0.8);
        padding: 1em;
        width: 98%;
    }
    .info-text-light {
        background: rgba(255, 255, 255, 0.8);
        padding: 1em;
        width: 98%;
    }
    .info-heading {
        float: left;
    }
    .close-icon {
        position: absolute;
        right: 1em;
        top: 1em;
        cursor: pointer;
    }
    .info-tagline {
        padding-left: 1em;
        color: #ddd !important;
        font-size: .5em;
    }
    .company-info {
        padding: 0.2em 1em;
        display: flex;
        justify-content: space-around;
    }
    .logo-img {
        height: 1em;
    }
    .credit-img {
        height: 10em;
    }
    .credit-item {
        opacity: 0.95;
        margin-right: 1em;
        border-radius: 0.5em;
        background: rgba(0, 0, 0, 0.8);
        padding: 0.3em;
        max-width: 7.3em;
        cursor: pointer;
        overflow-x: hidden;
    }
    .credits-container {
        height: 10em;
        margin: 1em 0em;
        display: flex;
        flex-direction: row;
    }
    .credit-description {
        word-break: normal;
        text-overflow: ellipsis;
        font-size: 0.8em;
        font-weight: 500;
        padding: 0em 0.2em;
    }
    .ext-link-icon {
        font-size: 1.5em;
    }
    .rating-info {
        font-size: 1.7em;
        padding: 0.2em;
        border: 0.2em solid #ccc;
        border-radius: 100%;
        font-weight: 500;
        background: rgba(0, 0, 0, 0.2);
        width: 1.9em;
        height: 1.9em;
        text-align: center;
        vertical-align: middle;
        display: inline-table;
        padding: 0.2em;
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
</style>
