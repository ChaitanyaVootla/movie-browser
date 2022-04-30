<template>
    <div>
        <img class="popover-bg-image" v-lazy="bgImageObj" />
        <div class="p-3">
            <h4>{{ item.name || item.title }}</h4>
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
            <div style="display: flex" class="mt-3">
                <div class="rating-container" v-for="rating in googleData.ratings" :key="rating[1]">
                    <a :href="rating.link" target="_blank">
                        <img :src="rating.imagePath" /><br />
                        <span>{{ rating.rating }}</span>
                    </a>
                </div>
            </div>
            <div v-if="googleData.allWatchOptions.length || googleData.watchLink" class="ext-links-container mt-3">
                <a
                    v-for="watchOption in googleData.allWatchOptions"
                    :key="watchOption.name"
                    :href="watchOption.link"
                    target="_blank"
                >
                    <div class="ott-container mr-3">
                        <img :src="watchOption.imagePath" class="ott-icon" />
                        <div>Watch Now</div>
                    </div>
                </a>
                <a
                    v-if="!googleData.allWatchOptions.length && googleData.watchLink"
                    :href="googleData.watchLink"
                    target="_blank"
                    class="mr-3"
                >
                    <div class="ott-container">
                        <img :src="googleData.imagePath" class="ott-icon" />
                        <div>Watch Now</div>
                    </div>
                </a>
            </div>
            <br />
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
import { api } from '../../API/api';
import { movieGenres, seriesGenres } from '../../Common/staticConfig';
import { mapGoogleData } from '../../Common/utils';

export default {
    name: 'popoverInfo',
    props: ['item', 'configuration'],
    data() {
        return {
            googleData: {
                allWatchOptions: [],
            },
            bgImageObj: {
                src:
                    this.configuration.images.secure_base_url +
                    'w300' +
                    (this.item.backdrop_path || this.item.backdropPath),
                error: require('../../Assets/Images/error.svg'),
            },
            showFullOverview: false,
        };
    },
    methods: {
        getGenreNameFromId(genreId: number) {
            const genre = movieGenres.concat(seriesGenres).find(({ id }) => genreId === id);
            if (genre) {
                return genre.name;
            }
        },
        async getGoogleData() {
            this.isGoogleDataLoading = true;
            const googleData = await api.getOTTLink(encodeURIComponent(this.googleLink.replace('&', '')));
            this.googleData = mapGoogleData(googleData);
            this.isGoogleDataLoading = false;
        },
        getYear(movieDate: any) {
            return new Date(movieDate).getFullYear();
        },
    },
    computed: {
        googleLink() {
            return `https://google.com/search?q=${this.item.name || this.item.title} ${
                this.item.first_air_date ? 'tv series' : this.getYear(this.item.release_date) + ' movie'
            }`;
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
