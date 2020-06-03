<template>
    <div>
        <div class="episode-item">
            <div class="img-container">
                <img v-lazy="imageObj" class="episode-card-image" @click="showFullEpisodeInfo(episode)"
                    v-bind:style="{ boxShadow: getRatingColor() + ' 0px 3px 10px 0.2em' }">
            </div>
            <div class="secondary-text mt-1">{{episode.name}}</div>
        </div>
    </div>
</template>

<script lang="ts">
    export default {
        name: 'episodeCard',
        props: [
            'episode',
            'configuration',
            'imageRes',
            'onSelected',
            'disableRatingShadow',
            'showFullEpisodeInfo'
        ],
        data() {
            return {
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + this.episode.still_path,
                    error: require('../../Assets/Images/error.svg'),
                }
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
            getYear: function(episodeDate: any) {
                return new Date(episodeDate).getFullYear();
            },
        },
        computed: {
            infoAvailable() {
                return this.episode.character || this.episode.job;
            }
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .episode-card-image[lazy=error] {
        background-size: 4em;
        padding: 4em;
        width: 20em;
    }
    .episode-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 20em;
    }
    .episode-item {
        display: flex;
        flex-direction: column;
        padding: 0 0.3em;
        cursor: pointer;
        position: relative;
        transition: transform .2s;
    }
    .episode-item:hover {
        transform: scale(1.05);
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
