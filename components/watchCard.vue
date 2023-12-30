<template>
    <NuxtLink :to="item.watchLink" target="blank" noreferrer noopener>
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative image">
                <v-img
                    cover
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-2 md:hover:-mt-2 border-2 hover:border-2
                        hover:border-neutral-700 border-transparent w-full h-full"
                    :alt="item.title || item.name"
                    :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${item.backdrop_path}`">
                    <template v-slot:placeholder>
                        <v-skeleton-loader type="image" class="iamge w-full h-full"></v-skeleton-loader>
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </v-img>
            </div>
            <div class="title overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 text-neutral-200 text-2xs md:text-base">
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
});
</script>

<style scoped lang="less">
@lg-height: 14rem;
@mobile-height: 6.5rem;

:deep(.image) {
    height: @lg-height;
    width: calc(@lg-height * 1.7777);
}
@media (max-width: 768px) {
    :deep(.image) {
        height: @mobile-height;
        width: calc(@mobile-height * 1.7777);
    }
}
</style>
