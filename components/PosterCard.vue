<template>
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative md:hover:mb-1 md:hover:-mt-1 hover:transition-all duration-300" :class="{'scale-95': watched}">
                <v-img
                    aspect-ratio="16/9"
                    cover
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800 w-full h-full hover:transition-all duration-300"
                    :class="{'opacity-70 saturate-0 group-hover:saturate-100 group-hover:opacity-100 border-neutral-700 border-2': watched}"
                    :alt="item.title || item.name"
                    :src="`https://image.tmdb.org/t/p/w300${item.poster_path}`">
                    <template v-slot:placeholder>
                        <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </v-img>
                <div v-if="isClient && isMovie(props.item)" class="absolute bottom-0 w-full p-2"
                    >
                    <v-tooltip :text="watched?'In watch list':'Add to watch list?'" location="bottom" :open-delay="300">
                        <template v-slot:activator="{ props }">
                            <v-btn
                                @click.prevent="toggleWatchList"
                                v-bind="props"
                                color="black"
                                class="!border-2 !border-neutral-900 opacity-60 float-start"
                                :class="{'!hidden group-hover:!block': !inWatchList, '!border-neutral-500': inWatchList}"
                                icon="mdi-plus"
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
                                class="!border-2 !border-neutral-900 opacity-60 float-end"
                                :class="{'!hidden group-hover:!block': !watched, '!border-neutral-500': watched}"
                                icon="mdi-check"
                                size="x-small">
                            </v-btn>
                        </template>
                    </v-tooltip>
                </div>
                <div v-if="isAiRoute" class="overlay invisible group-hover:visible absolute bottom-0 flex justify-center
                    w-full z-10 px-3 pt-4 items-center">
                    <div class="flex items-center justify-between w-full">
                        <Ratings class="hidden group-hover:block" :tmdbRating="item.vote_average" :itemId="item.id" :small="true"/>
                        <v-btn v-if="isAiRoute" color="#333" text="filter" prepend-icon="mdi-plus"
                            @click.prevent="addToParentFilter()" size="small"/>
                    </div>
                </div>
            </div>
            <div class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 group-hover:mt-4 text-neutral-200
                hidden md:block text-sm">
                {{ item.character || item.job || item.title || item.name }}
            </div>
            <div v-if="item.infoText" class=" text-neutral-400 text-2xs md:text-sm capitalize">
                {{ item.infoText }}
            </div>
            <!-- <div v-if="item.distance" class="text-neutral-400">
                {{  item.distance }} (distance)
            </div> -->
        </div>
    </NuxtLink>
</template>

<script setup lang="ts">
import { userStore } from '~/plugins/state';
import { isMovie } from '~/utils/movieIdentifier';

const isClient = ref(false);
const { status } = useAuth();

onMounted(() => {
    isClient.value = true;
});

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
