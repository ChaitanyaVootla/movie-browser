<template>
<span class="md:h-[23rem] md:w-[29rem] hidden"></span>
<span class="max-md:h-[15rem] max-md:w-[20rem] hidden"></span>
<IntersectionLoader height="23rem" width="29rem" mobileHeight="15rem" mobileWidth="20rem">
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`" class="flex flex-col h-full">
        <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780
        }${getEnglishBackdrop(item) || item.backdrop_path}`"
            class="rounded-lg mr-2 hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                hover:transition-all duration-300 flex-grow max-md:w-full"
            cover
            :aspect-ratio="1.78"
            :alt="item.name">
            <template v-slot:placeholder>
                <v-skeleton-loader type="image" />
            </template>
            <template v-slot:error>
                <v-skeleton-loader type="image" >
                    <div></div>
                </v-skeleton-loader>
            </template>
        </v-img>
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
