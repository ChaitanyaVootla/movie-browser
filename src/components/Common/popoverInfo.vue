<template>
    <div class="main-container">
        <img class="popover-bg-image" v-lazy="bgImageObj" />
        <div class="p-3">
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
                <h4>{{ item.name || item.title }}</h4>
            </router-link>
            <div v-if="item.genres && item.genres.length">
                <span v-for="(genre, index) in item.genres" :key="genre.id">
                    {{ genre.name }}{{ index === item.genres.length - 1 ? '' : ',' }}
                </span>
            </div>
            <div v-if="item.genre_ids && item.genre_ids.length">
                <span v-for="(genreId, index) in item.genre_ids" :key="genreId">
                    {{ getGenreNameFromId(genreId) }}{{ index === item.genre_ids.length - 1 ? '' : ',' }}
                </span>
            </div>
            <GoogleData
                class="mb-2 mt-2"
                :item="item"
                :rawGoogleData="googleData"
                :key="googleData.allWatchOptions.length"
            />
            <span v-if="showFullOverview">{{ item.overview }}</span>
            <span v-if="!showFullOverview">{{ item.overview.slice(0, 200) }}</span>
            <span
                v-if="item.overview.length > 200"
                class="expand-ellipsis ml-3"
                @click="showFullOverview = !showFullOverview"
                >...</span
            >
        </div>
    </div>
</template>

<script lang="ts">
import { movieGenres, seriesGenres } from '../../common/staticConfig';
import { sanitizeName, isMovie } from '@/common/utils';
import GoogleData from './googleData.vue';
import { api } from '@/API/api';

export default {
    name: 'popoverInfo',
    props: ['item', 'configuration'],
    components: {
        GoogleData,
    },
    data() {
        return {
            sanitizeName,
            googleData: {
                allWatchOptions: [],
                ratings: [],
            },
            bgImageObj: {
                src:
                    this.configuration.images.secure_base_url +
                    'w300' +
                    (this.item.backdrop_path || this.item.backdropPath),
            },
            showFullOverview: false,
        };
    },
    created() {
        this.getGoogleData();
    },
    methods: {
        async getGoogleData() {
            if (isMovie(this.item)) {
                const details = await api.getMovieDetails(this.item.id);
                this.googleData = details.googleData;
            } else {
                const details = await api.getTvDetails(this.item.id);
                this.googleData = details.googleData;
            }
        },
        getGenreNameFromId(genreId: number) {
            const genre = movieGenres.concat(seriesGenres).find(({ id }) => genreId === id);
            if (genre) {
                return genre.name;
            }
        },
    },
};
</script>

<style scoped lang="less">
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
.main-container {
    background-color: rgba(0, 0, 0, 0.382);
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
</style>
