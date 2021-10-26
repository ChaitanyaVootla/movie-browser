<template>
    <div class="item-container">
        <router-link :to="{
            name: item.first_air_date?'seriesInfo':'movieInfoFull',
            params:
                {
                    name: sanitizeName(item.name || item.title),
                    id: item.id
                }
            }"
            :title="item.name || item.title">
            <div class="img-container mt-2">
                <img v-lazy="imageObj" class="item-card-image"/>
            </div>
            <div class="secondary-text mt-1">
                {{item.title || item.name}}
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
    import { getFullDateText } from '../../Common/utils';
    import { sanitizeName } from '../../Common/utils';
    export default {
        name: 'wideCard',
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
                sanitizeName,
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
        &:hover {
            text-decoration: underline;
        }
    }
    .img-container {
        position: relative;
    }
    .play-icon {
        margin-top: 22%;
        margin-left: 0.6em;
        font-size: 2em;
        color: white;
    }
</style>
