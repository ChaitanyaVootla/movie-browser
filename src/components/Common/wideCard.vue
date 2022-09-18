<template>
    <div class="item-container pb-3">
        <router-link
            :to="{
                name: item.first_air_date ? 'seriesInfo' : 'movieInfoFull',
                params: {
                    name: sanitizeName(item.name || item.title),
                    id: item.id,
                },
            }"
            :title="item.name || item.title"
        >
            <div class="img-container mt-2">
                <el-popover trigger="hover" :open-delay="700" width="450" v-model="isPopoverVisible"
                    :disabled="isMobile()">
                    <img slot="reference" v-lazy="imageObj" class="item-card-image shimmer-img" />
                    <popover-info
                        v-if="isPopoverVisible"
                        :item="item"
                        :configuration="configuration"
                        ref="popoverInfo"
                    ></popover-info>
                </el-popover>
            </div>
            <div class="wide-card-text mt-1">
                {{ item.title || item.name }}
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
import { getFullDateText } from '../../Common/utils';
import { sanitizeName } from '../../Common/utils';
import { isMobile } from '../../Common/utils';
export default {
    name: 'wideCard',
    props: ['item', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showHeader'],
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
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';
@card-width: 20rem;
@card-height: 12rem;
.item-card-image[lazy='error'] {
    background-size: 4em;
    padding: 4em;
    width: @card-width;
}
.item-heading {
    font-size: 1em !important;
}
.item-card-image[lazy='loading'] {
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
.wide-card-text {
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
.play-icon {
    margin-top: 22%;
    margin-left: 0.6em;
    font-size: 2em;
    color: white;
}
</style>
