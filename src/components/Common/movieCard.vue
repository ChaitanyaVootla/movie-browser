<template>
    <div>
        <router-link :to="{
            name: movie.first_air_date?'seriesInfo':'movieInfoFull',
            params:
                {
                    name: sanitizeName(movie.name || movie.title),
                    id: movie.id
                }
            }">
            <div class="movie-item">
                <div class="img-container">
                    <img v-lazy="imageObj" class="movie-card-image">
                    <!-- TODO check this function is needed -->
                    <!-- <div class="img-overlay">
                        <a :href="`https://google.com/search?q=${movie.original_title || movie.name} ${movie.release_date?getYear(movie.release_date):'series'}`"
                            target="_blank" class="mr-3 pl-2 pr-2">
                            <font-awesome-icon :icon="['fab', 'google']" class="ext-link-icon"/>
                        </a>
                        <a @click="onSelected(movie)"
                            target="_blank" class="mr-1 pl-2 pr-1">
                            <font-awesome-icon :icon="['fas', 'eye']" class="ext-link-icon"/>
                        </a>
                    </div> -->
                </div>
                <div class="secondary-text mt-1">{{movie.character || movie.job}}</div>
            </div>
        </router-link>
    </div>
</template>

<script lang="ts">
    import { sanitizeName } from '../../Common/utils';

    export default {
        name: 'movieCard',
        props: ['movie', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow', 'showFullMovieInfo'],
        data() {
            return {
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + (this.movie.poster_path || this.movie.posterPath),
                    error: require('../../Assets/Images/error.svg'),
                },
                sanitizeName,
            };
        },
        methods: {
            getYear: function(movieDate: any) {
                return new Date(movieDate).getFullYear();
            },
        },
    }
</script>

<style scoped lang="less">
    @import '../../Assets/Styles/main.less';
    .movie-card-image[lazy=error] {
        background-size: 4em;
        padding: 4em;
        width: 10em;
    }
    .movie-card-image[lazy=loading] {
        background-image: url('../../Assets/Images/loader-bars.svg');
        background-size: contain;
        background-size: 4em;
        width: 10em;
    }
    .movie-item {
        display: flex;
        flex-direction: column;
        padding: 0 0.3em;
        cursor: pointer;
        position: relative;
        transition: transform .2s;
    }
    .movie-item:hover {
        transform: scale(1.05);
    }
    .movie-card-title {
        font-size: 1em;
        font-weight: 900;
        text-align: center;
    }
    .movie-card-image {
        border-radius: 3px;
        height: 15em;
        background-size: cover;
        background-repeat: no-repeat;
        background-position: 50% 50%;
    }
    .img-overlay {
        position: absolute;
        width: 96%;
        opacity: 0;
        left: 0.2em;
        right: 1em;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        padding: 0.2em;
        transition: 300ms;
    }
    .movie-item:hover .img-overlay {
        opacity: 1;
    }
    .ext-link-icon {
        color: @link-color-red;
    }
    .secondary-text {
        color: #aaa;
        font-size: 0.9em;
        max-width: 10em;
    }
    .img-container {
        position: relative;
    }
</style>
