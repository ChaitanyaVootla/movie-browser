<template>
    <div
        v-show="!(hideWatched && isWatched) && !(isInWatchList && hideWatchList)"
        @mouseover="isHoverActive = true"
        @mouseleave="isHoverActive = false"
    >
        <router-link
            :to="{
                name: movie.first_air_date ? 'seriesInfo' : 'movieInfoFull',
                params: {
                    name: sanitizeName(movie.name || movie.title),
                    id: movie.id,
                },
            }"
            :title="movie.name || movie.title"
        >
            <div
                class="movie-item"
                :class="`${canApplySideBarFilter && !isInSideBarFilter ? 'sideBarFilter' : ''}
                ${isTodayCard ? 'isTodayCard' : ''} ${isWatched ? 'watched' : ''} ${hideBadge ? 'trim-height' : ''}`"
            >
                <el-badge
                    :value="isMobile() || hideBadge ? '' : badgeText"
                    :class="`${badgeText} item ${isHoverActive ? 'isHoverActive' : ''}`"
                >
                    <div class="img-container">
                        <div v-if="isWatched" class="watched-overlay rating-info">
                            <font-awesome-icon :icon="['fas', 'check']" />
                        </div>
                        <el-popover
                            trigger="hover"
                            :open-delay="700"
                            width="500"
                            v-model="isPopoverVisible"
                            :disabled="isMobile()"
                        >
                            <img
                                slot="reference"
                                v-lazy="imageObj"
                                class="movie-card-image shimmer-img"
                                :alt="movie.name || movie.title"
                            />
                            <popover-info v-if="isPopoverVisible" :item="movie" :configuration="configuration" />
                        </el-popover>
                        <div class="info-overlay">
                            <div v-if="movie.release_date" class="top-overlay">{{
                                getDateText(movie.release_date)
                            }}</div>
                            <span
                                class="rating-info"
                                :style="`border-color: ${getRatingColor(movie.vote_average)};
                                color: ${getRatingColor(movie.vote_average)}`"
                            >
                                {{ movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : '-' }}
                            </span>
                            <el-tooltip
                                class="item"
                                effect="light"
                                :content="isSignedIn ? 'Watched this ?' : 'Sign in to use this feature'"
                                placement="bottom"
                                :open-delay="500"
                                :disabled="isWatched"
                            >
                                <span
                                    class="rating-info watched-action"
                                    :class="isWatched ? 'green' : ''"
                                    v-on:click.prevent
                                    @click="toggleWatched"
                                    v-if="movie.release_date"
                                >
                                    <font-awesome-icon :icon="['fas', 'check']" :class="isWatched ? 'green' : ''" />
                                </span>
                            </el-tooltip>
                        </div>
                    </div>
                </el-badge>
            </div>
            <div class="secondary-text mt-1 ml-1">{{ movie.character || movie.job || movie.bottomInfo }}</div>
        </router-link>
    </div>
</template>

<script lang="ts">
import { sanitizeName, isMobile, getRatingColor, getDateText } from '../../common/utils';
import { intersection } from 'lodash';
import moment from 'moment';
import popoverInfo from './popoverInfo.vue';
import { mapActions } from 'vuex';
import Vue from 'vue';

export default Vue.extend({
    components: { popoverInfo },
    name: 'movieCard',
    props: [
        'movie',
        'configuration',
        'imageRes',
        'onSelected',
        'disableRatingShadow',
        'showFullMovieInfo',
        'hideWatched',
        'hideWatchList',
        'hideBadge',
    ],
    data() {
        return {
            getRatingColor,
            isPopoverVisible: false,
            imageObj: {
                src:
                    this.configuration.images.secure_base_url +
                    'w300' +
                    (this.movie.poster_path || this.movie.posterPath),
            },
            bgImageObj: {
                src:
                    this.configuration.images.secure_base_url +
                    'w300' +
                    (this.movie.backdrop_path || this.movie.backdropPath),
            },
            sanitizeName,
            isMobile,
            getDateText,
            isHoverActive: false,
            showFullOverview: false,
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
                WATCH_LIST: {
                    text: 'WATCH LIST',
                },
                BACKDROP: {
                    text: 'BACKDROP',
                },
            },
        };
    },
    methods: {
        async toggleWatched() {
            if (this.isMovie) {
                if (this.isWatched) {
                    this.deleteWatched(this.movie.id);
                } else {
                    this.addWatchedMovie(this.movie.id);
                }
            }
        },
        ...mapActions({
            deleteWatched: 'delteWatchedMovie',
            addWatchedMovie: 'addWatchedMovie',
        }),
    },
    computed: {
        isSignedIn() {
            return this.$store.getters.isSignedIn;
        },
        isWatched() {
            return this.$store.getters.watchedMovieById(this.movie.id);
        },
        isMovie() {
            return this.movie.release_date ? true : false;
        },
        isInWatchList() {
            return this.$store.getters.watchListMovieById(this.movie.id);
        },
        isInSideBarFilter() {
            if (this.movie.first_air_date) {
                return (
                    this.$store.getters.canFilterSeries &&
                    intersection(
                        this.$store.getters.sideBarFilters.seriesGenres.map(({ id }) => id),
                        this.movie.genre_ids,
                    ).length
                );
            } else {
                return (
                    this.$store.getters.canFilterMovies &&
                    intersection(
                        this.$store.getters.sideBarFilters.movieGenres.map(({ id }) => id),
                        this.movie.genre_ids,
                    ).length
                );
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
            return this.movie.release_date
                ? moment(this.movie.release_date).isAfter(moment().clone().subtract(14, 'days').startOf('day'))
                : moment(this.movie.first_air_date).isAfter(moment().clone().subtract(1, 'months').startOf('day'));
        },
        canShowRecentBadge() {
            return this.movie.release_date
                ? moment(this.movie.release_date).isAfter(moment().clone().subtract(1, 'months').startOf('day'))
                : false;
        },
        canShowUnreleasedBadge() {
            return this.movie.release_date
                ? moment(this.movie.release_date).isAfter(moment())
                : moment(this.movie.first_air_date).isAfter(moment());
        },
        isWatching() {
            return this.$store.getters.watchListSeriesById(this.movie.id);
        },
        badgeText() {
            if (this.movie.adult && this.movie.backdrop_path) {
                return this.badgeTypes.BACKDROP.text;
            }
            if (this.isInWatchList) {
                return this.badgeTypes.WATCH_LIST.text;
            }
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
        oneTapUser() {
            return this.$store.getters.oneTapUser;
        },
    },
});
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
@img-height-percent: 96%;
@img-trim-height-percent: 92%;
@img-height: 17rem;
@img-width: 11.33rem;

.movie-card-image[lazy='error'] {
    padding: 3rem;
    object-fit: contain;
    width: @img-width;
    height: @img-height;
    box-shadow: rgba(0, 0, 0, 0.5) 0px 3px 10px 0.2em;
    background-color: #161616;
}
.sideBarFilter {
    opacity: 0.1;
}
.popover-bg-image {
    position: absolute;
    object-fit: cover;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: -1;
    opacity: 0.2;
}
.ott-icon {
    width: 3em;
}
/deep/ .el-badge__content {
    font-weight: 700;
    font-size: 0.7em;
    right: 10em;
    top: 24.5em;
}
/deep/ .el-badge.isHoverActive .el-badge__content {
    z-index: 55;
}
.rating-container {
    margin-right: 2em;
    text-align: center;
    img {
        width: 2.2em;
    }
    span {
        font-size: 0.9em;
    }
}
/deep/ .el-badge.RECENT .el-badge__content {
    background-color: rgb(255, 141, 141);
}
/deep/ .el-badge.WATCH .el-badge__content {
    background-color: rgb(255, 255, 255);
    right: 11em;
}
/deep/ .el-badge.UNRELEASED .el-badge__content {
    background-color: gray;
    right: 11.5em;
}
/deep/ .el-badge.WATCHED .el-badge__content {
    background-color: black;
    color: @text-color;
    right: 11.5em;
}
/deep/ .el-badge.WATCHING .el-badge__content {
    background-color: green;
    right: 11.5em;
}
/deep/ .el-badge.BACKDROP .el-badge__content {
    background-color: purple;
    right: 11.5em;
}
.isTodayCard .movie-card-image {
    // box-shadow: rgba(80, 80, 80) 0px 0px 10px 0.2em;
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
    transition: transform 0.3s ease-in-out;
    height: @img-height-percent !important;
    &.trim-height {
        height: @img-trim-height-percent !important;
    }
    &:hover {
        transform: scale(1.02);
    }
}
.movie-card-title {
    font-size: 1em;
    font-weight: 900;
    text-align: center;
}
.movie-card-image {
    border-radius: 5px;
    width: auto;
    height: @img-height;
    width: @img-width;
    object-fit: cover;
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
    height: @img-height;
    width: @img-width;
}
.info-overlay:active {
    transform: none;
}
.img-container:active {
    box-shadow: none;
    transform: scale(0.98);
}
.rating-info {
    font-size: 0.9em;
}
@media (max-width: 767px) {
    .secondary-text {
        font-size: 0.8em;
    }
}
</style>
