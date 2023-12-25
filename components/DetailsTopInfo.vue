<template>
    <div class="details-container bg-black">
        <div class="flex w-full h-full">
            <div class="w-full md:w-2/5 pl-14 flex flex-col justify-between h-full pt-10 left-info">
                <div class="h-1/2">
                    <div class="text-white font-bold text-3xl h-full">
                        <div v-if="logo" class="title-logo w-full h-full">
                            <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${logo}`"
                                :alt="item.title || item.name" class="object-contain" />
                        </div>
                        <div v-else>
                            {{ item.title || item.name }}
                        </div>
                    </div>
                </div>
                <div class="w-full h-1/2 flex pb-10 flex-col gap-5 justify-end">
                    <div class="flex gap-3 mt-5">
                        <div v-for="genre in item.genres">
                            <v-chip class="text-md" rounded>
                                {{ genre.name }}
                            </v-chip>
                        </div>
                    </div>
                    <div v-if="!minimal">
                        <div v-if="item.title" class="flex gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchClicked()" prepend-icon="mdi-check" :color="(watched === true)?'primary':''"
                                    :elevation="5" :height="50" class="px-5">
                                    Watched
                                </v-btn>
                            </div>
                            <div class="flex flex-col items-center justify-center">
                                <v-btn @click="watchListClicked()" prepend-icon="mdi-playlist-plus" :color="(watchlist === true)?'primary':''"
                                    :elevation="5" :height="50" class="px-5">
                                    Watch list
                                </v-btn>
                            </div>
                        </div>
                        <div v-else class="flex gap-6">
                            <div class="flex flex-col items-center justify-center">
                                <v-btn prepend-icon="mdi-playlist-plus" :elevation="5" :height="50" class="px-5" :color="(watchlist === true)?'primary':''">
                                    Watching
                                </v-btn>
                            </div>
                        </div>
                    </div>
                    <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id" class="mt-3"/>
                    <WatchOptions :googleData="item.googleData" :tmdbRating="item.vote_average" :movieId="item.id"/>
                    <div v-if="false" class="flex gap-5 mt-16">
                        <div v-for="cast in (item.credits?.cast?.slice(0, 5) || [])" class="flex flex-col justify-start w-24 items-center">
                            <NuxtImg
                                class="object-cover rounded-full h-24 w-24 object-center opacity-85"
                                :src="`https://image.tmdb.org/t/p/w200${cast.profile_path}`"
                                :alt="cast.name"
                            />
                            <div class="mt-1 text-neutral-400 text-xs overflow-ellipsis whitespace-nowrap overflow-hidden">
                                {{ cast.name }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="hidden md:block w-3/5 h-full">
                <div v-if="!showTrailer" class="group image-width h-full w-full relative image-container cursor-pointer"
                    @click="showTrailer = !showTrailer">
                    <div>
                        <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${item.backdrop_path}`"
                            :alt="item.title || item.name" class="bg-main object-cover object-top image-width h-full w-full absolute">
                        </NuxtImg>
                    </div>
                    <v-btn v-if="item.youtubeVideos?.length" color="primary"
                        class="rounded-pill !absolute bottom-10 right-16 group-hover:scale-110" prepend-icon="mdi-play"
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
                        :src="`https://www.youtube.com/embed/${item?.youtubeVideos[0]?.key
                            }?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${item?.youtubeVideos[0]?.key}`"
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
    watchlist: {
        type: Boolean,
        default: false
    },
    minimal: {
        type: Boolean,
        default: false
    }
});
const item = props.item;
const watched = ref(props.watched);

const logo = computed(() => {
    let logo = item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path;
    if (!logo) {
        logo = item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === null)?.file_path;
    }
    return logo;
})

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

const watchListClicked = () => {
}
</script>

<style scoped lang="less">
@info-height: calc(max(60vh, 500px) - 4rem);

.details-container {
    height: @info-height;
    .left-info {
        background-image: linear-gradient(145deg, #252525 0%, #151515 40%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0) 100%);
        .title-logo {
            img {
                min-height: 50%;
                max-height: 70%;
                min-width: 50%;
                max-width: 80%;
            }
        }
    }
    :deep(.image-container) {
        &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 11%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0) 100%),
                // linear-gradient(0deg, rgba(0, 0, 0, 0.75) 0%, rgba(0,0,0,0) 3%, rgba(0,0,0,0) 100%);
        }
    }
}
</style>