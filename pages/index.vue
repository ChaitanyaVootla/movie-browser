<template>
    <div class="mt-2 mx-14 invisible md:visible">
        <v-carousel height="50vh" color="white" :cycle="false" :interval="10000" hideDelimiterBackground
            delimiterIcon="mdi-minus-thick" class="group carousel">
            <template v-slot:prev="{ props }">
                <v-btn class="invisible group-hover:visible" icon="mdi-chevron-left" @click="props.onClick" color="#333"></v-btn>
            </template>
            <template v-slot:next="{ props }">
                <v-btn class="invisible group-hover:visible" icon="mdi-chevron-right" @click="props.onClick" color="#333"></v-btn>
            </template>
            <v-carousel-item v-for="item in (trending?.allItems || [])">
                <NuxtLink :to="`/${item.release_date ? 'movie': 'series'}/${item.id}`">
                    <div class="flex h-full w-full bg-black rounded-l-lg">
                        <div class="w-1/3 flex h-full flex-col justify-between">
                            <div class="top-info ml-16 mt-10">
                                <div class="text-3xl font-semibold">
                                    {{ item.title || item.name }}
                                </div>
                                <NuxtTime v-if="item.release_date" class="text-neutral-200 mt-1 block"
                                    :datetime="new Date(item.release_date)" year="numeric" month="long" day="numeric" />
                                <div class="flex gap-3 font-semibold mt-3">
                                    <div v-if="item.media_type === 'movie'" v-for="genreId in item.genre_ids">
                                        <v-chip color="#ccc" size="small" rounded>
                                            {{ movieGenres[genreId]?.name }}
                                        </v-chip>
                                    </div>
                                    <div v-if="item.media_type === 'tv'" v-for="genreId in item.genre_ids">
                                        <v-chip color="#ccc" size="small" rounded>
                                            {{ seriesGenres[genreId]?.name }}
                                        </v-chip>
                                    </div>
                                </div>
                            </div>
                            <div class="ml-16 mb-10">
                                <Ratings :tmdbRating="item.vote_average" :movieId="item.id" />
                            </div>
                        </div>
                        <div class="w-2/3 relative trending-image-container h-full">
                            <div class="h-full w-full">
                                <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes[2]}${item.backdrop_path}`"
                                    class="h-full w-full object-cover object-top !absolute trending-image bg-black rounded-r-md" />
                            </div>
                        </div>
                    </div>
                </NuxtLink>
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
const { pending, data: trending }: any = await useLazyAsyncData('trending',
    () => $fetch('/api/trending').catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (trending: any) => {
            return trending;
        },
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
        background-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 11%,
            rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.1) 100%);
    }
}
:deep(.carousel) {
    .v-carousel__controls {
        display: none;
    }
    &:hover {
        .v-carousel__controls {
            display: flex;
        }
    }
}
</style>
