<template>
    <NuxtLink :to="`/${item.release_date ? 'movie': 'series'}/${item.id}`">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative">
                <v-img
                    aspect-ratio="16/9"
                    cover
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-2 hover:-mt-2 border-2 hover:border-2
                        hover:border-neutral-700 border-transparent w-full h-full"
                    :alt="item.title || item.name"
                    :src="`https://image.tmdb.org/t/p/w300${item.poster_path}`">
                    <template v-slot:placeholder>
                        <v-skeleton-loader type="image" class="iamge w-full h-full"></v-skeleton-loader>
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </v-img>
                <div v-if="isAiRoute" class="overlay invisible group-hover:visible absolute bottom-0 flex justify-center
                    w-full z-10 pl-5 pr-5 bg-black opacity-90 pt-3 pb-3 items-center">
                    <div class="flex items-center justify-between w-full">
                        <div class="font-bold text-xl text-white">
                            {{ (item.vote_average || 0).toFixed(1) }}
                        </div>
                        <v-btn color="#ccc" text="Filter" @click.prevent="addToParentFilter()"/>
                    </div>
                </div>
            </div>
            <div v-if="item.infoText" class="mt-1 text-neutral-300 text-xs md:text-sm capitalize">
                {{ item.infoText }}
            </div>
            <div v-else class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 text-sm md:text-base text-neutral-200
                hidden md:block">
                {{ item.character || item.title || item.name }}
            </div>
            <!-- <div v-if="item.distance" class="text-neutral-400">
                {{  item.distance }} (distance)
            </div> -->
        </div>
    </NuxtLink>
</template>

<script setup lang="ts">
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

const addToParentFilter = () => {
    if (props.addToFilter) {
        props.addToFilter(props.item);
    }
};
</script>

<style scoped lang="less">
@image-width: 15rem;
@image-height: calc(@image-width * (3/2));

.card {
    flex: 0 0 auto;
    width: @image-width;
    .image {
        height: @image-height;
        width: @image-width;
    }
}
// reduce image-width for mobile
@media (max-width: 640px) {
    @image-width: 7rem;
    @image-height: calc(@image-width * (3/2));
    .card {
        width: @image-width;
        .image {
            height: @image-height;
            width: @image-width;
        }
    }
}
:deep(.v-skeleton-loader__image) {
    height: 100%;
}
</style>
