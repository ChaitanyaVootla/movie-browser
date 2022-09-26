<template>
    <div class="main-container">
        <q-carousel
            swipeable
            animated
            v-model="slide"
            arrows
            infinite
            navigation
            :autoplay="5000"
            control-color="white"
            class="carousel"
            >
            <template v-slot:navigation-icon="{ active, btnProps, onClick }">
                <q-btn v-if="active" icon="circle" flat round dense @click="onClick" />
                <q-btn v-else icon="horizontal_rule" flat round dense @click="onClick" />
            </template>
            <q-carousel-slide v-for="(item, index) in items.slice(0, 10)" :name="index"
                :img-src="`${configuration.images.secure_base_url}${configuration.images.imageSizes.w1280}${item.backdrop_path}`">
                <div class="slide-container">
                    <div class="image-mask"></div>
                    <div class="info">
                        <h5 class="title">{{item.name || item.title}}</h5>
                        <div class="genres q-mt-md">
                            <span v-for="genre in getGenres(item)" class="q-mr-sm">
                                {{genre.name}}
                            </span>
                        </div>
                    </div>
                </div>
            </q-carousel-slide>
        </q-carousel>
    </div>
</template>

<script lang="ts">
    import { configuration, movieGenresById, seriesGenreById } from '@/constants/tmdb'
    export default {
        props: {
            items: Array,
        },
        data() {
            return {
                configuration,
                slide: 0,
            }
        },
        methods: {
            getGenres(item: any) {
                if (item.title) {
                    return item.genre_ids.map((id: number) => movieGenresById[id]);
                } else {
                    return item.genre_ids.map((id: number) => seriesGenreById[id]);
                }
            }
        }
    }
</script>

<style scoped lang="scss">
    @import "../css/quasar.variables.sass";
    $carousel-width: 60;
    .main-container {
        padding: 0 !important;
        width: calc(100vw * $carousel-width / 100);
        @media (max-width:810px) {
            width: 100%;
        }
        .carousel {
            height: calc(100vw/2)*calc(9/16);
            width: 100%;
            @media (max-width:810px) {
                height: calc(100vw)*calc(9/16);
            }
            :deep(.q-carousel__navigation--bottom) {
                @media (max-width:810px) {
                    bottom: 0;
                    div {
                        scale: 0.4;
                    }
                }
                &::-webkit-scrollbar {
                    display: none;
                }
            }
        }
    }
    .q-carousel__slide {
        border-radius: 5px;
        background-size: cover !important;
        background-repeat: no-repeat;
        background-position: 0% 0%;
        background-color: rgba(0, 0, 0, 0.2) !important;
        padding: 0 !important;
        .slide-container {
            .image-mask {
                border-radius: 5px;
                position: absolute;
                width: 100%;
                height: 100%;
                opacity: 0.4;
                background: radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%);
            }
            .info {
                position: absolute;
                width: 100%;
                height: 100%;
                color: white;
                padding: 1rem;
                padding-left: 3rem;
                padding-top: 3rem;
                .title {
                    font-weight: 500;
                    font-size: 2rem;
                    line-height: 2rem;
                    margin: 0;
                }
                .genres {
                    font-size: 1rem;
                }
            }
        }
    }
</style>
