<template>
    <div class="mt-2 mx-14 invisible md:visible">
        <v-carousel height="50vh" color="white" :cycle="false" :interval="10000" hideDelimiterBackground
            delimiterIcon="mdi-minus-thick">
            <v-carousel-item v-for="item in (trending?.all || [])">
                <div class="flex h-full w-full bg-black">
                    <div class="flex-1 flex flex-col justify-between h-full">
                        <div class="top-info ml-16 mt-10">
                            <div class="text-3xl font-semibold">
                                {{ item.title || item.name }}
                            </div>
                            <NuxtTime v-if="item.release_date" class="text-neutral-200 mt-1 block"
                                :datetime="new Date(item.release_date)" year="numeric" month="long" day="numeric" />
                            <div class="flex gap-3 font-semibold mt-3">
                                <div v-if="item.media_type === 'movie'" v-for="genreId in item.genre_ids">
                                    {{ movieGenres[genreId]?.name }}
                                </div>
                                <div v-if="item.media_type === 'tv'" v-for="genreId in item.genre_ids">
                                    {{ seriesGenres[genreId]?.name }}
                                </div>
                            </div>
                        </div>
                        <div class="ml-16 mb-10">
                            <Ratings :tmdbRating="item.vote_average" :movieId="item.id" />
                        </div>
                    </div>
                    <div class="flex-1 relative h-full w-full trending-image-container after:bg-gradient-to-r from-indigo-500">
                        <NuxtImg :src="`https://image.tmdb.org/t/p/h632${item.backdrop_path}`" class="h-full w-full
                            object-cover !absolute trending-image bg-black" />
                    </div>
                </div>
            </v-carousel-item>
        </v-carousel>
    </div>
    <div>
        <Scroller :items="trending?.movies" :pending="pending" title="Trending Movies" class="mt-8" />
        <Scroller :items="trending?.tv" :pending="pending" title="Trending Series" class="mt-12" />
    </div>
</template>
<script setup lang="ts">
useHead({
    title: 'The Movie Browser',
});
const { pending, data: trending }: any = await useLazyFetch('/api/trending',
    {
        key: 'trending',
        default: () => ({
            all: [],
            movies: [],
            tv: []
        })
    }
);
</script>

<style scoped lang="less">
:deep(.trending-image-container) {
    &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: linear-gradient(to left, rgba(255, 255, 255, 0), #000000);
    }
}
</style>
