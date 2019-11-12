<template>
    <div>
        <div class="movie-item" v-on:click="onSelected(movie)">
            <img v-lazy="imageObj" class="movie-card-image"
                v-bind:style="{ boxShadow: getRatingColor() + ' 0px 3px 10px 0.001em',
                                border: 'solid .04em ' + getRatingColor()}">
        </div>
    </div>
</template>

<script lang="ts">
    export default {
        name: 'movieCard',
        props: ['movie', 'configuration', 'imageRes', 'onSelected', 'disableRatingShadow'],
        data() {
            return {
                imageObj: {
                    src: this.configuration.images.secure_base_url + this.imageRes + this.movie.poster_path,
                    error: require('../../Assets/Images/error.svg')
                }
            };
        },
        methods: {
            getRatingColor() {
                if (this.disableRatingShadow)
                    return 'none';
                const rating = this.movie.vote_average;
                if (rating < 5)
                    return 'rgba(200, 0 , 0, 1)';
                if (rating < 6.5)
                    return 'rgba(150, 100 , 0, 1)';
                if (rating < 8)
                    return 'rgba(0, 100 , 0, 1)';
                else
                    return 'rgba(91, 17, 130, 1)';
            }
        }
    }
</script>

<style scoped>
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
</style>
