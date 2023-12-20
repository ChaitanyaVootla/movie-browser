<template>
    <div class="item-container pb-3">
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
            <img v-lazy="imageObj" class="item-card-image shimmer-img" />
            <div class="wide-card-text secondary-text mt-1">
                {{ item.title || item.name }}
                <div class="genres">
                    <span v-for="(genre, index) in item.genre_ids" :key="index">
                        {{ getGrenreFromId(genre) }}
                    </span>
                </div>
            </div>
            <div>
                <!-- <GoogleData
                    class="mt-5 googleData-container ml-3"
                    :item="item"
                    :rawGoogleData="item.googleData"
                /> -->
                <!-- <div class="rating-container tmdb-rating">
                    <a href="" target="_blank" rel="noreferrer noopener">
                        <img src="/images/rating/tmdb.svg" /><br />
                        <span>{{ item.vote_average? item.vote_average.toFixed(1): '-' }}</span>
                    </a>
                </div> -->
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
import { getFullDateText, sanitizeName, isMobile, getGrenreFromId } from '@/common/utils';
import { configuration } from '@/common/staticConfig';
import GoogleData from './googleData.vue';

export default {
    name: 'infoCard',
    props: {
        item: {
            type: Object,
            required: true,
        },
    },
    components: {
        GoogleData,
    },
    data() {
        return {
            getGrenreFromId,
            isPopoverVisible: false,
            imageObj: {
                src: configuration.images.secure_base_url + configuration.images.backdrop_sizes[2] + this.item.backdrop_path,
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
@card-width: auto;
@card-height: auto;
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
    border-radius: 0.5rem;
    width: 100%;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    @media (max-width: @mobile-width) {
        height: @mobile-wide-card-height;
    }
}
.wide-card-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: @card-width;
    font-size: 1.1rem;
    font-weight: 500;
    max-width: @card-width;
    color: @text-color !important;
    margin-left: 0.3rem;
    .genres {
        font-size: 0.8rem;
        color: @text-color-secondary;
        span {
            &:not(:last-child):after {
                content: '•';
                margin: 0 0.2rem;
            }
        }
    }
}
</style>
