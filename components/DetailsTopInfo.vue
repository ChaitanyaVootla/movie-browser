<template>
    <div class="top-info relative">
        <div class="flex relative z-10">
            <div class="flex justify-center items-center w-full h-full relative">
                <div v-if="!showTrailer" class="image-width relative">
                    <NuxtImg :src="`https://image.tmdb.org/t/p/h632${item.backdrop_path}`" :alt="item.title || item.name"
                        class="bg-image bg-main object-cover image-width h-full rounded-b-xl shadow-lg shadow-neutral-800">
                        <template v-slot:placeholder>
                            <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                        </template>
                        <template v-slot:error>
                            <v-skeleton-loader type="image" class="image w-full h-full">
                                <div></div>
                            </v-skeleton-loader>
                        </template>
                    </NuxtImg>
                    <v-btn v-if="item.youtubeVideos?.length" @click="showTrailer = !showTrailer"
                        class="rounded-pill !absolute bottom-4 left-4" color="#ccc" prepend-icon="mdi-play"
                        :elevation="10">
                        Play Trailer
                    </v-btn>
                </div>
                <div v-else class="bg-image min-w-full flex justify-center">
                    <iframe
                        :id="`ytplayer-${item.id}`"
                        title="YouTube video player"
                        width="50%"
                        height="100%"
                        class="youtube-player"
                        :src="`https://www.youtube.com/embed/${item.youtubeVideos[0].key
                            }?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${item.youtubeVideos[0].key}`"
                        frameborder="0"
                        controls="1"
                        modestbranding
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        enablejsapi="1"
                        style="margin-bottom: -0.4em; box-shadow: 0px 0px 44px 10px rgba(0, 0, 0, 0.75)"
                        :key="item.youtubeVideos[0].key"
                    >
                    </iframe>
                </div>
                <div class="absolute left-20 flex flex-col justify-between h-full pt-10">
                    <div>
                        <div class="text-white font-bold text-4xl">
                            {{ item.title || item.name }}
                        </div>
                        <NuxtTime v-if="item.release_date" class="text-neutral-200 mt-1 block" :datetime="new Date(item.release_date)"
                            year="numeric" month="long" day="numeric" />
                        <div class="flex gap-3 pt-3">
                            <div v-for="genre in item.genres">
                                {{ genre.name }}
                            </div>
                        </div>
                        <div v-if="item.title" class="flex pt-16 gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchClicked(watched)" prepend-icon="mdi-check" variant="outlined"
                                    :color="watched?'red':'#ccc'" :elevation="5" :height="50" :width="150"
                                    class="backdrop-blur-lg !bg-neutral-800 bg-opacity-70">
                                    Watched
                                </v-btn>
                            </div>
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchListClicked(item.watched)" prepend-icon="mdi-playlist-plus" variant="outlined"
                                    color="#ccc" :elevation="5" :height="50" :width="150" class="backdrop-blur-lg !bg-neutral-800 bg-opacity-70">
                                    Watch list
                                </v-btn>
                            </div>
                        </div>
                        <div v-else class="flex pt-16 gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn prepend-icon="mdi-playlist-plus" variant="outlined" color="#ccc" :elevation="5" :height="50" :width="150"
                                    class="backdrop-blur-lg !bg-neutral-800 bg-opacity-70">
                                    Watching
                                </v-btn>
                            </div>
                        </div>
                    </div>
                    <div class="w-full flex pb-10 flex-col gap-5">
                        <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id"/>
                        <WatchOptions :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id"/>
                    </div>
                </div>
            </div>
        </div>
        <NuxtImg :src="`https://image.tmdb.org/t/p/h632${item.backdrop_path}`"
            class="bg-image bg-banner object-top w-full !absolute top-0 opacity-10 bg-black object-cover
            shadow-lg shadow-neutral-400" :alt="item.title || item.name" />
    </div>
</template>

<script setup lang="ts">
let showTrailer = ref(false);

const { item } = defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
    watched: {
        type: Boolean,
        required: true,
        default: {}
    },
});
const emit = defineEmits(['watchClicked'])

const watchClicked = (watched: boolean) => {
    emit('watchClicked', !watched);
    if (item.watched) {
        $fetch(`/api/user/movie/${item.id}/watched`, {
            method: 'POST',
        })
    } else {
        $fetch(`/api/user/movie/${item.id}/watched`, {
            method: 'DELETE',
        })
    }
}

const watchListClicked = (watched: boolean) => {
    if (watched) {
        item.watched = false;
    } else {
        item.watched = true;
    }
    if (item.watched) {
        $fetch(`/api/user/movie/${item.id}/watchlist`, {
            method: 'POST',
        })
    } else {
        $fetch(`/api/user/movie/${item.id}/watchlist`, {
            method: 'DELETE',
        })
    }
}
</script>

<style scoped lang="less">
@info-height: calc(max(55vh, 500px) - 4rem);

.top-info {
    height: @info-height;
    background: rgb(18,18,18);
    background: linear-gradient(0deg, rgba(18,18,18,1) 0%, rgba(0,0,0,0) 100%);
    :deep(.bg-image) {
        height: @info-height;
    }
    :deep(.image-width) {
        width: calc(@info-height * 1.78);
    }
    :deep(.bg-banner) {
        height: calc(@info-height - 1rem) !important;
        &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: linear-gradient(to bottom, rgba(255,0,0,0), #2c2c2c);
            opacity: 0.9;
        }
    }
}
</style>