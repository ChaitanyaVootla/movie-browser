<template>
    <div class="w-44 md:w-80 group cursor-pointer pt-2 flex flex-col">
        <NuxtLink :to="item.watchLink" target="blank" noreferrer noopener>
            <v-img
                cover
                class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                    hover:transition-all duration-300 hover:mb-1 md:hover:-mt-1 w-full h-auto"
                :aspect-ratio="1.77"
                :alt="item.title || item.name"
                :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${item.backdrop_path}`">
                <template v-slot:placeholder>
                    <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                </template>
                <template v-slot:error>
                    <v-skeleton-loader type="image" class="image w-full h-full">
                        <div></div>
                    </v-skeleton-loader>
                </template>
            </v-img>
        </NuxtLink>
        <div class="overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 text-neutral-200 text-2xs md:text-sm
            flex items-center gap-2">
            <div>
                <v-img :src="watchOptionImageMapper[item.watchProviderName]?.image"
                    class="max-md:w-6 max-md:h-6 md:w-7 md:h-7" :alt="item.watchProviderName"></v-img>
            </div>
            <div class="flex-grow">
                {{ item.character || item.title || item.name }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watchOptionImageMapper } from '~/utils/watchOptions';

defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
});
</script>
