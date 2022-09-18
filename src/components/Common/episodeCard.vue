<template>
    <div class="episode-item">
        <div class="secondary-text mt-1">
            Episode {{ episode.episode_number
            }}<span v-if="episode.air_date"> - {{ getFullDateText(episode.air_date) }}</span>
        </div>
        <div class="img-container" @click="openEpisodeDialog(episode)">
            <img
                v-lazy="imageObj"
                class="episode-card-image"
                v-bind:style="{ boxShadow: getRatingColor() + ' 0px 3px 10px 0.2em' }"
            />
        </div>
        <div class="secondary-text episode-heading mt-1 mb-1" v-if="showHeader">
            {{ episode.name }}
        </div>
    </div>
</template>

<script lang="ts">
import { getFullDateText } from '../../Common/utils';
export default {
    name: 'episodeCard',
    props: [
        'episode',
        'configuration',
        'imageRes',
        'onSelected',
        'disableRatingShadow',
        'openEpisodeDialog',
        'showHeader',
    ],
    data() {
        return {
            imageObj: {
                src: this.configuration.images.secure_base_url + this.imageRes + this.episode.still_path,
            },
            getFullDateText,
        };
    },
    methods: {
        getRatingColor() {
            return 'rgba(0, 0, 0, 0.5)';
            if (this.disableRatingShadow) {
                return 'none';
            }

            const rating = this.episode.vote_average;
            if (rating < 5) {
                return 'rgba(200, 0, 0, 1)';
            } else if (rating < 6.5) {
                return 'rgba(150, 100, 0, 1)';
            } else if (rating < 8) {
                return 'rgba(0, 100, 0, 1)';
            } else {
                return 'rgba(91, 17, 130, 1)';
            }
        },
        getYear: function (episodeDate: any) {
            return new Date(episodeDate).getFullYear();
        },
    },
    computed: {
        infoAvailable() {
            return this.episode.character || this.episode.job;
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
.episode-card-image[lazy='error'] {
    background-size: 4em;
    padding: 4em;
    width: 20em;
}
.episode-heading {
    font-size: 1em !important;
}
.episode-card-image[lazy='loading'] {
    background-size: contain;
    background-size: 4em;
    width: 20em;
}
.episode-item {
    display: flex;
    flex-direction: column-reverse;
    padding: 0 0.3em;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s;
}
.episode-item:hover {
    transform: scale(1.02);
}
.episode-card-title {
    font-size: 1em;
    font-weight: 900;
    text-align: center;
}
.episode-card-image {
    border-radius: 3px;
    height: 11em;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: 50% 50%;
}
.secondary-text {
    color: #aaa;
    font-size: 0.9em;
    max-width: 20em;
}
.img-container {
    position: relative;
}
</style>
