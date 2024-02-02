<template>
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`">
        <div class="wide-card group cursor-pointer pt-2 flex flex-col">
            <div class="relative">
                <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${item.backdrop_path}`"
                    class="rounded-lg mr-2 wide-image hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-1 md:hover:-mt-1"
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
            <div v-if="item.infoText" class="mt-1 text-neutral-300 text-2xs md:text-sm capitalize">
                {{ item.infoText }}
            </div>
            <div v-else class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 text-neutral-200 max-md:text-2xs md:text-sm">
                {{ item.character || item.title || item.name }}
            </div>
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
