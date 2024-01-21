<template>
    <div>
        <div class="flex justify-between items-center py-2">
            <slot :item="title">
                <div class="title text-lg mb-5">
                    {{ title }}
                </div>
            </slot>
            <div>
                <v-btn-toggle v-model="viewType" mandatory density="compact" @update:model-value="viewTypeUpdated">
                    <v-btn icon="mdi-view-comfy" class="px-5" />
                    <v-btn icon="mdi-view-headline" class="px-5" />
                </v-btn-toggle>
            </div>
        </div>
        <div class="grid pb-3" :class="{list: viewType}">
            <div v-for="item in items">
                <div v-if="viewType">
                    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`">
                        <div class="relative">
                            <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${item.backdrop_path}`"
                                class="rounded-lg mr-2 wide-image hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                                    hover:transition-all duration-300"
                                cover
                                :alt="item.name">
                                <template v-slot:placeholder>
                                    <v-skeleton-loader class="wide-image" type="image" />
                                </template>
                                <template v-slot:error>
                                    <v-skeleton-loader class="wide-image" type="image" >
                                        <div></div>
                                    </v-skeleton-loader>
                                </template>
                            </v-img>
                            <div class="absolute -bottom-1 -right-3 bg-black px-2 pt-3 rounded-tl-3xl">
                                <!-- <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id"
                                    :small="true" :minimal="true"/> -->
                                <div class="text-lg font-semibold">
                                    <v-icon size="x-small" class="text-yellow-400">mdi-star</v-icon>
                                    {{ item.vote_average?.toFixed(1) }}
                                </div>
                            </div>
                        </div>
                        <div class="mt-1">
                            <div class="text-default font-semibold">{{ item.title || item.name }}</div>
                            <div class="flex gap-3 mt-1 -ml-1">
                                <div v-for="genre in getGenres(item)">
                                    <v-chip class="text-md" rounded size="small">
                                        {{ genre }}
                                    </v-chip>
                                </div>
                            </div>
                            <div class="text-sm text-neutral-400 line-clamp-2 mt-1">
                                {{ item.overview }}
                            </div>
                        </div>
                    </NuxtLink>
                </div>
                <PosterCard v-else :item="item" :addToFilter="addToFilter" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps({
    items: {
        type: Object,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    addToFilter: {
        type: Function,
    }
});

const list = useRoute().query.list as string;
const viewType = ref(list?parseInt(list):0);

const getGenres = (item: any) => {
    if (item.genres?.length) {
        return item.genres.map((genre: any) => genre.name);
    }
    if (item.title) {
        return item.genre_ids?.map((genreId: number) => movieGenres[genreId]?.name);
    } else {
        return item.genre_ids?.map((genreId: number) => seriesGenres[genreId]?.name);
    }
}

const viewTypeUpdated = (val: number) => {
    useRouter().replace({ query: {
        ...useRoute().query,
        list: val
    }});
};
</script>

<style scoped lang="less">
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    grid-gap: 2rem;
    &.list {
        grid-template-columns: repeat(auto-fill, minmax(25rem, 1fr));
    }
}
@media screen and (max-width: 768px) {
    @image-mobile-width: 7rem;
    .grid {
        grid-template-columns: repeat(auto-fill, minmax(@image-mobile-width, 1fr));
        grid-gap: 2px;
    }
    :deep(.card) {
        width: 100%;
        .image {
            height: auto;
            width: 100%;
        }
    }
}

@wide-image-height: 15rem;
:deep(.wide-image) {
    height: @wide-image-height;
    width: calc(@wide-image-height * 16/9);
}
:deep(.wide-card) {
    width: calc(@wide-image-height * 16/9);
}
@media (max-width: 768px) {
    @wide-image-height: 7rem;
    :deep(.wide-image) {
        height: @wide-image-height;
        width: calc(@wide-image-height * 16/9);
    }
    :deep(.wide-card) {
        width: calc(@wide-image-height * 16/9);
    }
}
:deep(.v-skeleton-loader__image) {
    height: 100%;
}
</style>
