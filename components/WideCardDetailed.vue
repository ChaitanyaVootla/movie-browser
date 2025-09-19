<template>
<span class="md:h-[25rem] md:w-[29rem] hidden"></span>
<span class="max-md:h-[17rem] max-md:w-[20rem] hidden"></span>
<IntersectionLoader height="25rem" width="29rem" mobileHeight="17rem" mobileWidth="20rem" :eager="true">
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}/${getUrlSlug(item.title || item.name)}`" class="flex flex-col h-full">
        <SeoImg 
            :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${getEnglishBackdrop(item) || item.backdrop_path}`"
            :alt="`${item.name || item.title} backdrop image`"
            class="rounded-lg mr-2 hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                hover:transition-all duration-300 flex-grow max-md:w-full"
            cover
            eager
            :aspect-ratio="1.78">
            <template #placeholder>
                <v-skeleton-loader type="image" />
            </template>
            <template #error>
                <div class="w-full h-full bg-neutral-700 rounded-lg"></div>
            </template>
        </SeoImg>
        <div class="mt-1">
            <div class="flex justify-between items-center">
                <div>
                    <div class="text-sm font-semibold">
                        <div>{{ item.title || item.name }}</div>
                    </div>
                </div>
                <div class="mt-2">
                    <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id"
                        :small="true" :minimal="true"/>
                </div>
            </div>
            <div class="flex gap-1 md:gap-3 mt-1 overflow-x-auto flex-wrap">
                <div v-for="genre in getGenres(item)">
                    <v-chip class="text-md" rounded :size="$vuetify.display.mdAndUp?'small':'x-small'">
                        {{ genre }}
                    </v-chip>
                </div>
            </div>
            <div class="text-sm text-neutral-400 line-clamp-2 mt-1">
                {{ item.overview }}
            </div>
        </div>
    </NuxtLink>
</IntersectionLoader>
</template>

<script setup lang="ts">
import { configuration, movieGenres, seriesGenres } from '~/utils/constants'
import { getUrlSlug } from '~/utils/slug'

defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
});

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
</script>
