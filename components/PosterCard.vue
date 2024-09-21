<template>
<span class="md:w-[15rem] md:h-[25rem] hidden"></span>
<span class="max-md:h-[12rem] max-md:w-[8rem] hidden"></span>
<IntersectionLoader height="25rem" width="15rem" mobileHeight="12rem" mobileWidth="8rem">
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`" v-memo="[item.id, watched, inWatchList]">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative md:hover:mb-1 md:hover:-mt-1 hover:transition-all duration-300" :class="{'scale-95': watched}">
                <v-img
                    aspect-ratio="16/9"
                    cover
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800 w-full h-full hover:transition-all duration-300"
                    :class="{'saturate-0 opacity-80 border-neutral-500 border-2 shadow-lg shadow-neutral-700': watched}"
                    :alt="`${item.title || item.name} poster`"
                    :src="`https://image.tmdb.org/t/p/w300${item.poster_path}`">
                    <template v-slot:placeholder>
                        <v-skeleton-loader color="black" type="image" class="image w-full h-full"></v-skeleton-loader>
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader color="black" type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </v-img>
                <ClientOnly>
                    <div v-if="isMovie(props.item)" class="absolute bottom-0 w-full p-0"
                        >
                        <v-tooltip :text="inWatchList?'In watch list':'Add to watch list?'" location="bottom" :open-delay="300">
                            <template v-slot:activator="{ props }">
                                <v-btn
                                    @click.prevent="toggleWatchList"
                                    v-bind="props"
                                    color="black"
                                    class="!border-2 !border-neutral-700 opacity-60 float-start !text-base"
                                    :class="{'!hidden group-hover:!block': !inWatchList, '!border-neutral-500': inWatchList}"
                                    icon="mdi-plus"
                                    rounded
                                    size="x-small">
                                </v-btn>
                            </template>
                        </v-tooltip>
                        <v-tooltip :text="watched?'Watched':'Watched?'" location="bottom" :open-delay="300">
                            <template v-slot:activator="{ props }">
                                <v-btn
                                    @click.prevent="toggleWatch"
                                    v-bind="props"
                                    color="black"
                                    class="!border-2 !border-neutral-700 opacity-60 float-end !text-base"
                                    :class="{'!hidden group-hover:!block': !watched, '!border-neutral-500': watched}"
                                    :icon="watched?'mdi-check':'mdi-eye-outline'"
                                    rounded
                                    size="x-small">
                                </v-btn>
                            </template>
                        </v-tooltip>
                    </div>
                </ClientOnly>
                <div v-if="isAiRoute" v-once class="overlay invisible group-hover:visible absolute bottom-0 flex justify-center
                    w-full z-10 px-3 pt-4 items-center">
                    <div class="flex items-center justify-between w-full">
                        <Ratings class="hidden group-hover:block" :tmdbRating="item.vote_average" :itemId="item.id" :small="true"/>
                        <v-btn v-if="isAiRoute" color="#333" text="filter" prepend-icon="mdi-plus"
                            @click.prevent="addToParentFilter()" size="small"/>
                    </div>
                </div>
            </div>
            <h3 class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 group-hover:mt-4 text-neutral-200
                hidden md:block text-sm">
                {{ item.character || item.job || item.title || item.name }}
            </h3>
            <div v-if="item.infoText" class=" text-neutral-400 text-2xs md:text-sm capitalize">
                {{ item.infoText }}
            </div>
            <!-- <div v-if="item.distance" class="text-neutral-400">
                {{  item.distance }} (distance)
            </div> -->
        </div>
    </NuxtLink>
</IntersectionLoader>
</template>

<script setup lang="ts">
import { userStore } from '~/plugins/state';
import { isMovie } from '~/utils/movieIdentifier';

const { status } = useAuth();

const props = defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
    addToFilter: {
        type: Function,
    },
    pending: {
        type: Boolean,
        default: true
    },
});
const isAiRoute = useRoute().name === 'ai'

const userData = userStore();
let watched = computed(() => {
    if (status.value !== 'authenticated' || !props?.item?.id) return false;
    return isMovie(props.item) && userData.isMovieWatched(props.item.id) ? true : false;
});
let inWatchList = computed(() => {
    if (status.value !== 'authenticated' || !props?.item?.id) return false;
    return isMovie(props.item) && userData.isMovieInWatchList(props.item.id) ? true : false;
});
const addToParentFilter = () => {
    if (props.addToFilter) {
        props.addToFilter(props.item);
    }
};
const toggleWatch = () => {
    if (isMovie(props.item)) {
        userData.toggleWatchMovie(props.item.id);
    }
};
const toggleWatchList = () => {
    if (isMovie(props.item)) {
        userData.toggleMovieWatchList(props.item.id);
    }
};
</script>

<style scoped lang="less">
@image-width: 15rem;
@image-height: calc(@image-width * (3/2));
@image-mobile-width: 8rem;
@image-mobile-height: calc(@image-mobile-width * (3/2));

.card {
    flex: 0 0 auto;
    width: @image-width;
    .image {
        height: @image-height;
        width: @image-width;
    }
    .overlay {
        background-image: linear-gradient(0deg, black 0%, rgba(0, 0, 0, 0.95) 80%, rgba(0, 0, 0, 0) 100%);
    }
}
// reduce image-width for mobile
@media (max-width: 640px) {
    .card {
        flex: 0 0 auto;
        width: @image-mobile-width;
        .image {
            height: @image-mobile-height;
            width: @image-mobile-width;
        }
    }
}
:deep(.v-skeleton-loader__image) {
    height: 100%;
}
</style>
