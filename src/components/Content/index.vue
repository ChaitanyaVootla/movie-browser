<template>
    <div class="movies-grid-container">
        <div v-for="movie in allMovies.nodes" :key="movie.id" @click="onClick(movie)">
            <img
                v-lazy="{
                    src: configuration.images.secure_base_url + 'original' + movie.posterPath,
                    error: require('../../Assets/Images/error.svg'),
                }"
                class="episode-card-image"
            />
        </div>
    </div>
</template>

<script>
import Movies from '../../graphql/Movie.gql';
import { sanitizeName } from '../../Common/utils';

export default {
    data() {
        return {};
    },
    props: ['configuration'],
    apollo: {
        allMovies: Movies,
    },
    computed: {
        movieNames() {
            return this.allMovies.nodes.map(({ originalTitle }) => originalTitle);
        },
    },
    methods: {
        onClick(movie) {
            this.$router
                .push({
                    name: 'movieInfoFull',
                    params: {
                        name: sanitizeName(movie.name || movie.originalTitle),
                        id: movie.id,
                    },
                })
                .catch((err) => {});
        },
    },
};
</script>

<style scoped lang="less">
@import '../../Assets/Styles/main.less';

.movies-grid-container {
    padding-left: 3em;
    padding-right: 3em;
    display: flex;
    flex-wrap: wrap;
}
.episode-card-image {
    border-radius: 3px;
    height: 20em;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: 50% 50%;
}
.episode-card-image[lazy='loading'] {
    background-image: url('../../Assets/Images/loader-bars.svg');
    background-size: contain;
    background-size: 4em;
    height: 20em;
}
.episode-card-image[lazy='error'] {
    background-size: 4em;
    padding: 4em;
    height: 20em;
}
</style>
