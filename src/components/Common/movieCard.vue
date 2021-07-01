<template>
    <div v-show="!(hideWatched && isWatched)"
        @mouseover="isHoverActive = true"
        @mouseleave="isHoverActive = false">
        <router-link :to="{
            name: movie.first_air_date?'seriesInfo':'movieInfoFull',
            params:
                {
                    name: sanitizeName(movie.name || movie.title),
                    id: movie.id
                }
            }"
            :title="movie.name || movie.title">
            <div class="movie-item" :class="`${canApplySideBarFilter && !isInSideBarFilter?'sideBarFilter':''} ${isTodayCard?'isTodayCard':''} ${isWatched?'watched':''}`">
                <el-badge :value="(isMobile() || hideBadge)?'':badgeText" :class="`${badgeText} item ${isHoverActive?'isHoverActive':''}`">
                    <div class="img-container">
                        <div v-if="isWatched" class="watched-overlay rating-info">
                            <font-awesome-icon :icon="['fas', 'check']"/>
                        </div>
                        <img v-lazy="imageObj" class="movie-card-image" :alt="movie.name || movie.title">
                        <!-- TODO check if this function is needed -->
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
                        <!-- <div class="top-overlay" v-if="movie.release_date">{{getDateText(movie.release_date)}}</div> -->
                        <div class="info-overlay">
                            <div v-if="movie.release_date" class="top-overlay">{{getDateText(movie.release_date)}}</div>
                            <span class="rating-info" :style="`border-color: ${getRatingColor(movie.vote_average)};
                                color: ${getRatingColor(movie.vote_average)}`">
                                {{movie.vote_average?Math.round(movie.vote_average * 10) / 10:'-'}}
                            </span>
                            <el-tooltip v-if="user.displayName" class="item" effect="light" content="Watched this ?" placement="bottom" :open-delay="500"
                                :disabled="isWatched">
                                <span class="rating-info watched-action" :class="isWatched?'green':''"
                                    v-on:click.prevent @click="toggleWatched" v-if="movie.release_date">
                                    <font-awesome-icon :icon="['fas', 'check']" :class="isWatched?'green':''"/>
                                </span>
                            </el-tooltip>
                        </div>
                    </div>
                </el-badge>
            </div>
            <div class="secondary-text mt-1 ml-1">{{movie.character || movie.job || movie.bottomInfo}}</div>
        </router-link>
    </div>
</template>

<script lang="ts">
    import { api } from '../../API/api';
    import { sanitizeName, isMobile } from '../../Common/utils';
    import { getRatingColor, getDateText } from '../../Common/utils';
    import { db } from '../../Common/firebase';
    import { HISTORY_OMIT_VALUES } from '../../Common/constants';
    import { omit, intersection } from 'lodash';
    import moment from 'moment';

    export default {
        name: 'movieCard',
        props: ['movie', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showFullMovieInfo',
            'hideWatched', 'hideBadge'],
        data() {
            return {
                getRatingColor,
                imageObj: {
                    src: this.configuration.images.secure_base_url + 'w185' + (this.movie.poster_path || this.movie.posterPath),
                    error: require('../../Assets/Images/error.svg'),
                },
                sanitizeName,
                isMobile,
                getDateText,
                isHoverActive: false,
                badgeTypes: {
                    NEW: {
                        text: 'NEW',
                    },
                    RECENT: {
                        text: 'RECENT',
                    },
                    UNRELEASED: {
                        text: 'UNRELEASED',
                    },
                    WATCHED: {
                        text: 'WATCHED',
                    },
                    WATCHING: {
                        text: 'WATCHING',
                    },
                }
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
            isInSideBarFilter() {
                if (this.movie.first_air_date) {
                    return this.$store.getters.canFilterSeries && intersection(this.$store.getters.sideBarFilters.seriesGenres.map(({ id }) => id), this.movie.genre_ids).length;
                } else {
                    return this.$store.getters.canFilterMovies && intersection(this.$store.getters.sideBarFilters.movieGenres.map(({ id }) => id), this.movie.genre_ids).length;
                }
            },
            isTodayCard() {
                return this.movie.bottomInfo && this.movie.bottomInfo.includes('Today');
            },
            canApplySideBarFilter() {
                if (this.movie.first_air_date) {
                    return this.$store.getters.canFilterSeries;
                } else {
                    return this.$store.getters.canFilterMovies;
                }
            },
            canShowNewBadge() {
                return this.movie.release_date?moment(this.movie.release_date).isAfter(moment().clone().subtract(14, 'days').startOf('day')):
                    moment(this.movie.first_air_date).isAfter(moment().clone().subtract(1, 'months').startOf('day'));
            },
            canShowRecentBadge() {
                return this.movie.release_date?moment(this.movie.release_date).isAfter(moment().clone().subtract(1, 'months').startOf('day')):false;
            },
            canShowUnreleasedBadge() {
                return this.movie.release_date?moment(this.movie.release_date).isAfter(moment()):
                    moment(this.movie.first_air_date).isAfter(moment());
            },
            isWatched() {
                return this.$store.getters.watchedMovieIds.includes(this.movie.id)
            },
            isWatching() {
                return this.$store.getters.watchListSeriesById(this.movie.id);
            },
            badgeText() {
                if (this.isWatched) {
                    return this.badgeTypes.WATCHED.text;
                }
                if (this.isWatching) {
                    return this.badgeTypes.WATCHING.text;
                }
                if (this.canShowUnreleasedBadge) {
                    return this.badgeTypes.UNRELEASED.text;
                }
                if (this.canShowNewBadge) {
                    return this.badgeTypes.NEW.text;
                }
                if (this.canShowRecentBadge) {
                    return this.badgeTypes.RECENT.text;
                }
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
    .sideBarFilter {
        opacity: 0.1;
    }
    /deep/ .el-badge__content {
        font-weight: 700;
        font-size: 0.7em;
        right: 10em;
        top: 24.5em;
    }
    /deep/ .el-badge.isHoverActive .el-badge__content {
        // top: 17em;
        z-index: 55;
    }
    /deep/ .el-badge.RECENT .el-badge__content {
        background-color:rgb(255, 141, 141)
    }
    /deep/ .el-badge.UNRELEASED .el-badge__content {
        background-color:gray;
        right: 11.5em;
    }
    /deep/ .el-badge.WATCHED .el-badge__content {
        background-color:black;
        color: @text-color;
        right: 11.5em;
    }
    /deep/ .el-badge.WATCHING .el-badge__content {
        background-color: green;
        right: 11.5em;
    }
    .isTodayCard .movie-card-image {
        // height: 15.5em;
        box-shadow: rgba(80, 80, 80) 0px -4px 15px 0.2em;
    }
    .movie-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 11em;
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
        display: flex;
        // flex-direction: column;
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
        width: auto;
        height: 17em;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: 50% 50%;
    }
    .watched {
        opacity: 0.7;
        filter: grayscale();
        transition: 300ms;
        transform: scale(0.92);
    }
    .watched:hover {
        filter: none;
        opacity: 1;
        border: none;
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
    .top-overlay {
        text-align: center;
        padding-bottom: 0.2em;
        font-size: 0.8em;
        font-weight: 500;
        color: #aaa;
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
        z-index: 50;
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
    .info-overlay:active {
        transform: none;
    }
    .img-container:active {
        box-shadow: none;
        // bottom: -2px;
        transform: scale(0.98);
    }
    .rating-info {
        font-size: 0.9em;
    }
</style>
