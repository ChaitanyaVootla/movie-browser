<template>
    <div v-show="!(hideWatched && isWatched)">
        <router-link :to="{
            name: movie.first_air_date?'seriesInfo':'movieInfoFull',
            params:
                {
                    name: sanitizeName(movie.name || movie.title),
                    id: movie.id
                }
            }">
            <div class="movie-item">
                <div class="img-container">
                    <div v-if="isWatched" class="watched-overlay rating-info">
                        <font-awesome-icon :icon="['fas', 'check']"/>
                    </div>
                    <img v-lazy="imageObj" class="movie-card-image" :class="isWatched?'watched':''">
                    <!-- TODO check this function is needed -->
                    <!-- <div class="img-overlay">
                        <a :href="`https://google.com/search?q=${movie.original_title || movie.name} ${movie.release_date?getYear(movie.release_date):'series'}`"
                            target="_blank" class="mr-3 pl-2 pr-2">
                            <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                        </a>
                        <a @click="onSelected(movie)"
                            target="_blank" class="mr-1 pl-2 pr-1">
                            <font-awesome-icon :icon="['fas', 'eye']" class="ext-link-icon"/>
                        </a>
                    </div> -->
                    <div class="info-overlay">
                        <span class="rating-info" :style="`border-color: ${getRatingColor(movie.vote_average)};
                            color: ${getRatingColor(movie.vote_average)}`">
                            {{movie.vote_average}}
                        </span>
                        <el-tooltip class="item" effect="light" content="Watched this ?" placement="bottom" :open-delay="500"
                            :disabled="isWatched">
                            <span class="rating-info watched-action" :class="isWatched?'green':''"
                                v-on:click.prevent @click="toggleWatched" v-if="movie.release_date">
                                <font-awesome-icon :icon="['fas', 'check']" :class="isWatched?'green':''"/>
                            </span>
                        </el-tooltip>
                        <!-- {{movie.vote_average}} -->
                    </div>
                </div>
                <div class="secondary-text mt-1 ml-1">{{movie.character || movie.job || movie.bottomInfo}}</div>
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { sanitizeName } from '../../Common/utils';
    import { getRatingColor } from '../../Common/utils';
    import { db } from '../../Common/firebase';
    import { HISTORY_OMIT_VALUES } from '../../Common/constants';
    import { omit } from 'lodash';

    export default {
        name: 'movieCard',
        props: ['movie', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showFullMovieInfo',
            'hideWatched'],
        data() {
            return {
                getRatingColor,
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + (this.movie.poster_path || this.movie.posterPath),
                    error: require('../../Assets/Images/error.svg'),
                },
                sanitizeName,
            };
        },
        methods: {
            getYear: function(movieDate: any) {
                return new Date(movieDate).getFullYear();
            },
            async toggleWatched() {
                const details = await api.getMovieDetails(parseInt(this.movie.id));
                if (!this.user.displayName) {
                    return;
                }
                const userDbRef = db.collection('users').doc(this.user.uid);
                if (details.release_date) {
                    if (this.isWatched) {
                        userDbRef.collection('watchedMovies').doc(`${details.id}`).delete();
                    } else {
                        userDbRef.collection('watchedMovies').doc(`${details.id}`).set({
                            ...omit(details, HISTORY_OMIT_VALUES),
                            updatedAt: Date.now(),
                        });
                    }
                }
            }
        },
        computed: {
            isWatched() {
                return this.$store.getters.watchedMovieIds.includes(this.movie.id) ||
                    this.$store.getters.watchedSeriesIds.includes(this.movie.id);
            },
            user() {
                return this.$store.getters.user;
            },
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .movie-card-image[lazy=error] {
        background-size: 4em;
        padding: 4em;
        width: 11em;
        box-shadow: rgba(0, 0, 0, 0.5) 0px 3px 10px 0.2em;
        background-color: #161616;
    }
    .movie-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 11em;
    }
    .top-overlay {
        display: none;
    }
    .watched-overlay {
        position: absolute;
        bottom: 0;
        right: 0;
        font-size: 1em;
        margin: 0.5em;
        opacity: 1;
        background-color: black;
        z-index: 50;
    }
    .movie-item {
        cursor: pointer;
        transition: transform .3s ease-in-out;
    }
    .movie-item:hover {
        transform: scale(1.02);
    }
    .movie-card-title {
        font-size: 1em;
        font-weight: 900;
        text-align: center;
    }
    .movie-card-image {
        border-radius: 3px;
        height: 17em;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: 50% 50%;
    }
    .watched {
        opacity: 0.8;
        filter: grayscale();
    }
    .watched-action {
        float: right;
    }
    .green {
        color: green;
        border-color: green;
    }
    .img-overlay {
        position: absolute;
        width: 96%;
        opacity: 0;
        left: 0.2em;
        right: 1em;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        padding: 0.2em;
        transition: 300ms;
    }
    .movie-item:hover .img-overlay {
        opacity: 1;
    }
    .info-overlay {
        position: absolute;
        width: 100%;
        opacity: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        padding: 0.3em 0.5em;
        transition: 300ms;
        z-index: 1000000;
    }
    .movie-item:hover .info-overlay {
        opacity: 1;
    }
    .ext-link-icon {
        color: @link-color-red;
    }
    .secondary-text {
        color: #aaa;
        font-size: 0.9em;
        max-width: 10em;
    }
    .img-container {
        position: relative;
    }
    .rating-info {
        font-size: 0.9em;
    }
</style>
