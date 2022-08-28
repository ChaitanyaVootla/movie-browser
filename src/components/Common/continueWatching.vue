<template>
    <el-popover trigger="hover" :open-delay="700" width="450" v-model="isPopoverVisible"
        :disabled="isMobile()">
        <popover-info
            v-if="isPopoverVisible"
            :item="item"
            :configuration="configuration"
            ref="popoverInfo"
        ></popover-info>
        <div slot="reference" class="item-container">
            <a :href="item.watchOption.link" target="_blank" @click="watchNowClicked(watchOption)">
                <div class="img-container mt-2">
                    <img v-lazy="imageObj" class="item-card-image" />
                </div>
                <div class="watch-overlay">
                    <img :src="item.watchOption.imagePath" class="watch-ott-icon" />
                </div>
            </a>
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
                <div class="continue-card-text mt-1 ml-1">
                    {{ item.title || item.name }}
                </div>
            </router-link>
        </div>
    </el-popover>
</template>

<script lang="ts">
import { getFullDateText } from '../../Common/utils';
import { sanitizeName } from '../../Common/utils';
import { isMobile } from '../../Common/utils';
export default {
    name: 'continueWatching',
    props: ['item', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showHeader'],
    data() {
        return {
            isPopoverVisible: false,
            imageObj: {
                src: this.configuration.images.secure_base_url + this.imageRes + this.item.backdrop_path,
                error: require('../../Assets/Images/error.svg'),
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
@card-height: 11rem;
.watch-ott-icon {
    height: 2.2em;
    padding: 3px;
}
.item-card-image[lazy='error'] {
    background-size: 4em;
    padding: 4em;
    width: @card-width;
}
.item-heading {
    font-size: 1em !important;
}
.item-card-image[lazy='loading'] {
    background-image: url('../../Assets/Images/loader-bars.svg');
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
