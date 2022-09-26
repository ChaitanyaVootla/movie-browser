<template>
    <div class="main-container">
        <div class="images-container">
            <img class="backdrop" :src="`${configuration.images.secure_base_url}${configuration.images.imageSizes.w1280}${details.backdrop_path}`" />
            <div class="main-image-container">
                <img class="main-image" :src="`${configuration.images.secure_base_url}${configuration.images.imageSizes.w1280}${details.backdrop_path}`" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { configuration, movieGenresById, seriesGenreById } from '@/constants/tmdb'
    export default {
        props: {
            details: Object,
        },
        data() {
            return {
                configuration,
            }
        }
    }
</script>

<style scoped lang="scss">
@import '@/assets/main.scss';
$container-height: calc(max(50vh, 35rem));
.main-container {
    position: relative;
    .images-container {
        // background-color: black;
        .backdrop {
            width: 100%;
            height: $container-height;
            object-fit: cover;
            object-position: 50% 20%;
            opacity: 0.5;
            filter: blur(3px);
        }
        .main-image-container {
            position: absolute;
            top: 0;
            display: flex;
            justify-content: center;
            width: 100%;
            .main-image {
                height: $container-height;
                border-bottom-left-radius: 2rem;
                border-bottom-right-radius: 2rem;
                // box-shadow: $dark-box-shadow;
            }
        }
    }
}
</style>