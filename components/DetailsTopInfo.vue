<template>
    <div class="top-info bg-black">
        <div class="flex w-full h-full">
            <div class="w-1/3 ml-14 flex flex-col justify-between h-full pt-10">
                <div>
                    <div class="text-white font-bold text-3xl">
                        {{ item.title || item.name }}
                    </div>
                    <NuxtTime v-if="item.release_date" class="text-neutral-200 mt-1 block" :datetime="new Date(item.release_date)"
                        year="numeric" month="long" day="numeric" />
                    <div class="flex gap-3 pt-3">
                        <div v-for="genre in item.genres">
                            <v-chip size="small" rounded>
                                {{ genre.name }}
                            </v-chip>
                        </div>
                    </div>
                    <div v-if="!minimal">
                        <div v-if="item.title" class="flex pt-16 gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchClicked()" prepend-icon="mdi-check" :color="(watched === true)?'red':''"
                                    :elevation="5" :height="50" :width="150" class="!bg-neutral-800" :min-width="200">
                                    Watched
                                </v-btn>
                            </div>
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchListClicked(item.watched)" prepend-icon="mdi-playlist-plus"
                                    :elevation="5" :height="50" :width="150" class="!bg-neutral-800" :min-width="200">
                                    Watch list
                                </v-btn>
                            </div>
                        </div>
                        <div v-else class="flex pt-16 gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn prepend-icon="mdi-playlist-plus" variant="outlined" color="#ccc" :elevation="5" :height="50" :width="150"
                                    class="!bg-neutral-800">
                                    Watching
                                </v-btn>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="w-full flex pb-10 flex-col gap-5">
                    <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id"/>
                    <WatchOptions :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id"/>
                </div>
            </div>
            <div class="w-2/3 h-full">
                <div v-if="!showTrailer" class="group image-width h-full w-full relative image-container cursor-pointer"
                    @click="showTrailer = !showTrailer">
                    <div>
                        <NuxtImg :src="`https://image.tmdb.org/t/p/h632${item.backdrop_path}`" :alt="item.title || item.name"
                            class="bg-main object-cover object-top image-width h-full w-full absolute">
                        </NuxtImg>
                    </div>
                    <v-btn v-if="item.youtubeVideos?.length"
                        class="rounded-pill !absolute bottom-4 right-16 group-hover:scale-110" color="#ccc" prepend-icon="mdi-play"
                        :elevation="10">
                        Play Trailer
                    </v-btn>
                </div>
                <div v-else class="bg-image w-full h-full">
                    <iframe
                        :id="`ytplayer-${item.id}`"
                        title="YouTube video player"
                        width="100%"
                        height="100%"
                        :src="`https://www.youtube.com/embed/${item.youtubeVideos[0].key
                            }?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${item.youtubeVideos[0].key}`"
                        frameborder="0"
                        controls="1"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                    >
                    </iframe>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
let showTrailer = ref(false);

const props = defineProps({
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
    minimal: {
        type: Boolean,
        default: false
    }
});
const item = props.item;
const watched = ref(props.watched);

watch(() => props.watched, (newValue) => {
    watched.value = newValue;
})

const emit = defineEmits(['watchClicked'])

const watchClicked = () => {
    watched.value = !watched.value;
    emit('watchClicked', watched.value);
    if (watched.value === true) {
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
    :deep(.image-container) {
        &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 11%,
                rgba(0,0,0,0.1) 20%, rgba(0,0,0,0) 100%);
        }
    }
}
</style>