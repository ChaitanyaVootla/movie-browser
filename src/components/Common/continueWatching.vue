<template>
    <div class="item-container">
        <a :href="item.watchOption.link" target="_blank"
            @click="watchNowClicked(watchOption)">
            <div class="img-container mt-2">
                <img v-lazy="imageObj" class="item-card-image"/>
                <div class="watch-overlay">
                    <div>
                    <font-awesome-icon :icon="['fas', 'play-circle']" class="play-icon"/></div>
                </div>
            </div>
        </a>
        <div class="secondary-text mt-1">
            {{item.title || item.name}}
        </div>
    </div>
</template>

<script lang="ts">
    import { getFullDateText } from '../../Common/utils';
    export default {
        name: 'continueWatching',
        props: [
            'item',
            'configuration',
            'imageRes',
            'onSelected',
            'disableRatingShadow',
            'showHeader'
        ],
        data() {
            return {
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + this.item.backdrop_path,
                    error: require('../../Assets/Images/error.svg'),
                },
                getFullDateText,
            };
        },
        methods: {
            getYear: function(episodeDate: any) {
                return new Date(episodeDate).getFullYear();
            },
        },
        computed: {
        }
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .item-card-image[lazy=error] {
        background-size: 4em;
        padding: 4em;
        width: 20em;
    }
    .item-heading {
        font-size: 1em !important;
    }
    .item-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 20em;
    }
    .item-container {
        display: flex;
        flex-direction: column;
        padding: 0 0.3em;
        cursor: pointer;
        position: relative;
        transition: transform .2s;
    }
    .item-container:hover {
        transform: scale(1.02);
    }
    .item-card-image {
        border-radius: 3px;
        height: 9em;
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
    .watch-overlay {
        position: absolute;
        top: 0;
        height: 100%;
        width: 100%;
        z-index: 10;
        opacity: 0.5;
        background-color: #333;
    }
    .play-icon {
        margin-top: 22%;
        margin-left: 0.6em;
        font-size: 2em;
        color: white;
    }
</style>
