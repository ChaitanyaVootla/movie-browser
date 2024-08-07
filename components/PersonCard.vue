<template>
    <NuxtLink :to="`/person/${item.id}`">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative">
                <v-img
                    aspect-ratio="16/9"
                    cover
                    :alt="`${item.name} as ${item.job || item.character}`"
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-1 md:hover:-mt-1 border-2 border-transparent
                        hover:border-neutral-800 border-neutral-800 w-full h-full"
                    :src="`https://image.tmdb.org/t/p/w185${item.profile_path}`">
                    <template v-slot:placeholder>
                        <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </v-img>
            </div>
            <h3 class="title mt-1 text-xs md:text-sm">
                {{ item.name }}
            </h3>
            <h3 v-if="item.job || item.character" class="text-neutral-400 text-xs md:text-sm">
                {{  item.job || item.character }}
            </h3>
        </div>
    </NuxtLink>
</template>

<script lang="ts">
    export default {
        name: "PersonCard",
        props: {
            item: {
                type: Object,
                required: true,
                default: {}
            },
            pending: {
                type: Boolean,
                default: true
            },
        },
    }
</script>

<style scoped lang="less">
@image-width: 7.5rem;
@image-height: calc(@image-width * (3/2));
@image-mobile-width: 5.5rem;
@image-mobile-height: calc(@image-mobile-width * (3/2));

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
