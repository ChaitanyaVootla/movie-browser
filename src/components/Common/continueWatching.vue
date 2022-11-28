<template>
    <el-popover trigger="hover" :open-delay="700" width="450" v-model="isPopoverVisible" :disabled="isMobile()">
        <popover-info
            v-if="isPopoverVisible"
            :item="item"
            :configuration="configuration"
            ref="popoverInfo"
        ></popover-info>
        <div slot="reference" class="item-container">
            <a :href="item.watchOption.link" target="_blank">
                <div class="img-container mt-2">
                    <img v-lazy="imageObj" class="item-card-image" />
                </div>
                <div class="watch-overlay">
                    <img :src="item.watchOption.imagePath" class="watch-ott-icon" />
                </div>
                <div class="watch-overlay-play-icon">
                    <i class="fa-solid fa-circle-play"></i>
                </div>
            </a>
            <router-link
                :to="{
                    name: item.first_air_date ? 'seriesInfo' : 'movieInfoFull',
                    params: {
                        name: sanitizeName(item.title || item.name),
                        id: item.id,
                    },
                }"
                :title="item.name || item.title"
            >
                <div class="continue-card-text mt-1 ml-1">
                    {{ item.title || item.name }}
                </div>
            </router-link>
        </div>
    </el-popover>
</template>

<script lang="ts">
import { getIconFromLink, isMobile, sanitizeName, getFullDateText } from '@/common/utils';
import Vue from 'vue';

export default Vue.extend({
    name: 'continueWatching',
    props: ['item', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showHeader'],
    created() {
        this.item.watchOption = getIconFromLink(this.item.watchLink);
    },
    data() {
        return {
            isPopoverVisible: false,
            imageObj: {
                src: this.configuration.images.secure_base_url + this.imageRes + this.item.backdrop_path,
            },
            getFullDateText,
            sanitizeName,
            isMobile,
        };
    },
    methods: {
        getYear: function (episodeDate: any) {
            return new Date(episodeDate).getFullYear();
        },
    },
    computed: {},
});
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';

@card-width: 20rem;
@card-height: 12rem;
.watch-ott-icon {
    height: 2.2em;
    padding: 3px;
}
.watch-overlay-play-icon {
    position: absolute;
    bottom: 3rem;
    right: 2rem;
    @media (max-width: @mobile-width) {
        bottom: 3rem;
        right: 1rem;
    }
    svg {
        font-size: 1.2rem;
        color: #ddd;
        opacity: 0.7;
    }
}
.item-card-image[lazy='error'] {
    background-size: 4em;
    padding: 4em;
    width: @card-width;
    @media (max-width: @mobile-width) {
        width: @mobile-wide-card-width;
    }
}
.item-heading {
    font-size: 1em !important;
}
.item-card-image[lazy='loading'] {
    background-size: contain;
    background-size: 4em;
    width: @card-width;
}
.item-container {
    display: flex;
    flex-direction: column;
    padding: 0 0.3em;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s;
    @media (max-width: @mobile-width) {
        width: @mobile-wide-card-width;
    }
}
.item-container:hover {
    transform: scale(1.02);
}
.item-card-image {
    border-radius: 3px;
    height: @card-height;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    @media (max-width: @mobile-width) {
        height: @mobile-wide-card-height;
    }
}
.continue-card-text {
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-bottom: 10px;
    width: @card-width;
    font-size: 0.9em;
    max-width: @card-width;
    &:hover {
        text-decoration: underline;
    }
}
.img-container {
    position: relative;
}
.watch-overlay {
    position: absolute;
    top: 0.5em;
    left: 0.5em;
    height: 100%;
    width: 100%;
    z-index: 10;
}
.play-icon {
    margin-top: 22%;
    margin-left: 0.6em;
    font-size: 2em;
    color: white;
}
</style>
