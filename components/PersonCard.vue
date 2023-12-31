<template>
    <NuxtLink :to="`/person/${item.id}`">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative">
                <v-img
                    aspect-ratio="16/9"
                    cover
                    :alt="item.name"
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-2 md:hover:-mt-2 border-2 border-transparent
                        hover:border-neutral-700 border-neutral-800 w-full h-full"
                    :src="`https://image.tmdb.org/t/p/w185${item.profile_path}`">
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
            <div class="title mt-1 text-xs md:text-base">
                {{ item.name }}
            </div>
            <div v-if="item.job || item.character" class="text-neutral-400 text-xs md:text-sm">
                {{  item.job || item.character }}
            </div>
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
    @image-width: 5rem;
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
