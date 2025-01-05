<template>
    <div class="details-container bg-black">
        <div class="hidden md:flex w-full h-full">
            <div class="w-full md:w-[45%] pl-16 flex flex-col justify-between h-full pt-10 left-info">
                <div class="h-1/2">
                    <div class="text-white font-bold text-3xl h-full">
                        <div v-if="logo" class="title-logo logo-shadow w-full h-full">
                            <NuxtImg :src="logoPath" @error="onLogoError"
                                :alt="item.title || item.name" class="object-contain" />
                        </div>
                        <div v-else class="h-full w-full">
                            {{ item.title || item.name }}
                        </div>
                    </div>
                </div>
                <div class="w-full h-1/2 flex mb-3 flex-col gap-5 justify-end">
                    <WatchOptions :googleData="item.googleData" :tmdbRating="item.vote_average" :item="item"/>
                    <div class="flex gap-3">
                        <div v-for="genre in item.genres">
                            <NuxtLink :to="getGenreLink(genre)">
                                <v-chip class="text-md" rounded>
                                    {{ genre.name }}
                                </v-chip>
                            </NuxtLink>
                        </div>
                    </div>
                    <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id" :title="item.title"
                        :voteCount="item.vote_count"/>
                    <div v-if="false" class="flex gap-5">
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
            <div class="hidden md:block w-[55%] h-full">
                <div v-if="!showTrailer" class="group image-width h-full w-full relative image-container cursor-pointer
                    md:after:mr-14"
                    @click="minimal?'':showTrailer = !showTrailer">
                    <div>
                        <NuxtImg :src="imagePath"
                            @error="onError" 
                            :alt="item.title || item.name" class="bg-main object-cover object-top image-width h-full w-full absolute
                            md:pr-14">
                        </NuxtImg>
                    </div>
                    <v-btn v-if="item.youtubeVideos?.length" color="primary"
                        class="rounded-pill !absolute bottom-5 right-20 z-10 group-hover:scale-110" prepend-icon="mdi-play"
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
                        :src="`https://www.youtube.com/embed/${(item?.youtubeVideos || [])[0]?.key
                            }?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${(item?.youtubeVideos || [])[0]?.key}`"
                        controls="1"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    >
                    </iframe>
                </div>
            </div>
        </div>
        <div class="md:hidden">
            <div class="">
                <div class="bg-mobile-container relative w-full h-full" v-if="!showMobileTrailer" @click="minimal?'':showMobileTrailer = !showMobileTrailer">
                    <div>
                        <NuxtImg :src="imagePath" @error="onError"
                            :alt="item.title || item.name" class="bg-mobile object-top image-width object-cover w-full">
                        </NuxtImg>
                    </div>
                    <div class="!absolute bottom-5 flex justify-center w-full">
                        <v-btn v-if="item.youtubeVideos?.length" color="primary" size="x-small"
                            class="rounded-pill z-10" prepend-icon="mdi-play"
                            :elevation="10">
                            Play Trailer
                        </v-btn>
                    </div>
                </div>
                <div v-else class="bg-image w-full bg-mobile">
                    <iframe
                        :id="`ytplayer-${item.id}`"
                        title="YouTube video player"
                        width="100%"
                        height="100%"
                        :src="`https://www.youtube.com/embed/${(item?.youtubeVideos || [])[0]?.key
                            }?&rel=0&autoplay=1&iv_load_policy=3&loop=1&playlist=${(item?.youtubeVideos || [])[0]?.key}`"
                        controls="1"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    >
                    </iframe>
                </div>
            </div>
            <div class="text-white font-bold text-2xl flex justify-center items-center">
                <NuxtImg v-if="logo" :src="logoPath" @error="onLogoError"
                    :alt="item.title || item.name" class="object-contain h-20 w-4/5 logo-shadow" />
                <div v-else>
                    {{ item.title || item.name }}
                </div>
            </div>
            <div class="flex flex-col gap-3 justify-center items-center mt-5">
                <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id" :small="true" :title="item.title"/>
                <WatchOptions v-if="!minimal" :googleData="item.googleData" :tmdbRating="item.vote_average" :item="item"/>
                <div v-if="!minimal" class="flex gap-2 flex-wrap justify-center">
                    <div v-for="genre in item.genres">
                        <NuxtLink :to="getGenreLink(genre)">
                            <v-chip class="text-md" size="small" rounded>
                                {{ genre.name }}
                            </v-chip>
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { getTopicKey } from '~/utils/topics/commonUtils';

let showTrailer = ref(false);
let showMobileTrailer = ref(false);
const props = defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
    minimal: {
        type: Boolean,
        default: false
    }
});
const item = props.item;

const logo = computed(() => {
    return item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path;
})

const getGenreLink = (genre: any) => {
    const topicKey = getTopicKey('genre', genre.name, item.title?'movie':'tv');
    return `/topics/${topicKey}`;
}

const imagePath = ref(getCdnImage(item, IMAGE_TYPE.BACKDROP));
const logoPath = ref(getCdnImage(item, IMAGE_TYPE.LOGO));

const onLogoError = () => {
    logoPath.value = `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${logo.value}`;
}
const onError = () => {
    imagePath.value = `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${item.backdrop_path}`;
}
</script>

<style scoped lang="less">
@info-height: calc(max(60vh, 500px) - 4rem);

.details-container {
    height: @info-height;
    .left-info {
        .title-logo {
            img {
                min-height: 50%;
                max-height: 70%;
                max-width: 80%;
            }
        }
    }
    .logo-shadow {
        filter: drop-shadow(0 0 1px #777);
    }
    @media (max-width: 768px) {
        .logo-shadow {
            filter: drop-shadow(0 0 0.4px #eee);
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
            background-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 5%, rgba(0,0,0,0.1) 10%, rgba(0,0,0,0) 100%);
        }
    }
    :deep(.bg-mobile) {
        height: calc(100vw * 0.5625);
    }
    :deep(.bg-mobile-container) {
        &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image: linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 11%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0) 100%);
        }
    }
}
@media (max-width: 768px) {
    .details-container {
        height: auto;
    }
}
</style>