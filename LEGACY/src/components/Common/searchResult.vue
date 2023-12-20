<template>
    <div class="search-item">
        <img
            v-lazy="{
                src: imageBasePath + (searchItem.poster_path || searchItem.profile_path),
            }"
            class="search-image"
        />
        <div class="search-info-container ml-3">
            <span>
                {{ searchItem.title || searchItem.name || searchItem.original_name || searchItem.original_title }}
                <span
                    class="text-muted ml-1"
                    style="font-size: 0.9em"
                    v-if="searchItem.release_date || searchItem.first_air_date"
                >
                    {{ getYear(searchItem.release_date || searchItem.first_air_date) }} - {{ searchItem.media_type }}
                </span>
            </span>
            <div style="margin-top: -5px">
                <span
                    v-for="(genreId, index) in searchItem.genre_ids"
                    :key="genreId"
                    class="text-muted ml-1"
                    style="font-size: 0.9em"
                >
                    {{ getGenreNameFromId(genreId) }}{{ index === searchItem.genre_ids.length - 1 ? '' : ',' }}
                </span>
            </div>
            <div v-if="searchItem.media_type !== 'person'" class="mt-3">
                <div class="rating-container tmdb-rating">
                    <a href="" target="_blank" rel="noreferrer noopener">
                        <img src="/images/rating/tmdb.svg" /><br />
                        <span>{{ searchItem.vote_average? searchItem.vote_average.toFixed(1): '-' }}</span>
                    </a>
                </div>
            </div>
            <div v-if="searchItem.media_type === 'person'" class="mt-4">
                {{ searchItem.known_for_department }}<br />
                <div class="text-muted wrap-text" style="font-size: 0.9em">
                    <span v-for="(content, index) in searchItem.known_for" :key="index">
                        {{ content.original_title || content.original_name }},
                    </span>
                </div>
            </div>
            <div class="word-wrap mt-2 mobile-hide">
                {{ searchItem.overview }}
            </div>
        </div>
        <hr />
    </div>
</template>

<script lang="ts">
import { getRatingColor, getYear } from '@/common/utils';

export default {
    name: 'searchResults',
    props: ['searchItem', 'getGenreNameFromId', 'imageBasePath'],
    data() {
        return {
            getRatingColor,
            getYear,
        };
    },
};
</script>

<style scoped lang="less">
.rating-container {
    display: flex;
    a {
        display: flex;
        align-items: center;
        gap: 0.2rem;
    }
    img {
        height: 1rem;
    }
}
.search-item {
    display: flex;
    margin-bottom: 0.5em;
    padding-bottom: 0.5em;
    cursor: pointer;
    border-bottom: solid 1px #252525;
    line-height: 24px !important;
}
.search-image[lazy='error'] {
    background-size: 4em;
    padding: 2em;
    width: 7em;
}
.search-image[lazy='loading'] {
    background-size: contain;
    padding: 2em;
    width: 7em;
}
.rating-info {
    font-size: 0.9em;
    width: 2.3em;
}
.search-image {
    height: 10em;
    border-radius: 3px;
}
.search-item:last-child {
    border-bottom: 0;
}
.search-item:hover {
    background: rgb(8, 8, 8);
}
.search-info-container {
    display: flex;
    flex-direction: column;
}
.word-wrap {
    display: flex;
    width: 75%;
    white-space: initial;
    word-break: break-word;
    font-size: 0.8em;
    overflow: hidden;
    max-height: 4em;
}
.wrap-text {
    display: flex;
    flex-wrap: wrap;
}
</style>
