<template>
    <div class="-mb-5 md:mb-0">
        <v-carousel :height="$vuetify.display.mobile?'21rem':'55vh'" color="white" :cycle="true" :interval="10000" hideDelimiterBackground
            delimiterIcon="mdi-circle" class="carousel" :key="trending?.allItems?.length">
            <template v-slot:prev="{ props }">
                <v-icon icon="mdi-chevron-left" @click="props.onClick"></v-icon>
            </template>
            <template v-slot:next="{ props }">
                <v-icon icon="mdi-chevron-right" @click="props.onClick"></v-icon>
            </template>
            <v-carousel-item v-for="item in (trending?.allItems || [])">
                <NuxtLink :to="`/${item.release_date ? 'movie': 'series'}/${item.id}`">
                    <DetailsTopInfo :item="item" :watched="false" :minimal="true" />
                </NuxtLink>
            </v-carousel-item>
        </v-carousel>
    </div>
    <div class="mt-5 md:mt-0 p-3 pb-16">
        <div v-if="status === 'authenticated' && watchList?.ongoingSeries?.length">
            <Scroller :items="watchList.ongoingSeries" :pending="false" title="Upcoming Episodes" class="mb-2 md:pb-12" />
            <Scroller :items="watchList.movies" :pending="false" title="Movies in your watch list" class="mb-2 md:pb-12" />
        </div>
        <Scroller :items="trending?.movies" :pending="pending" title="Trending Movies" class="" />
        <Scroller :items="trending?.tv" :pending="pending" title="Trending Series" class="mt-3 md:pt-12" />
    </div>
</template>
<script setup lang="ts">
import { useAuth } from '#imports'

const { status } = useAuth();

const { pending, data: trending }: any = await useLazyAsyncData('trending',
    () => $fetch('/api/trending').catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (trending: any) => {
            return {
                ...trending,
                allItems: trending.allItems.map(
                    (item: any) => {
                        if (item.media_type === 'movie') {
                            return {
                                ...item,
                                genres: item.genre_ids.map((genreId: number) => movieGenres[genreId]),
                            }
                        } else if (item.media_type === 'tv') {
                            return {
                                ...item,
                                genres: item.genre_ids.map((genreId: number) => seriesGenres[genreId]),
                            }
                        }
                    }
                )
            }
        },
    }
);

const { data: watchList, execute } = await useLazyAsyncData('ongoingSeries',
    () => $fetch('/api/user/watchList').catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: ({movies, series}: any) => {
            return {
                movies,
                ongoingSeries: mapWatchListSeries(series)?.currentRunningSeries
            };
        },
    }
);

setTimeout(() => {
    execute();
});

useHead({
    title: 'The Movie Browser',
    meta: [
        {
            hid: 'description',
            name: 'description',
            content: 'Track, discover and find where to watch TV shows and movies.',
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: 'Track, discover and find where to watch TV shows and movies.',
        },
        {
            hid: 'og:image',
            property: 'og:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'og:url',
            property: 'og:url',
            content: 'https://themoviebrowser.vercel.app',
        },
        {
            hid: 'twitter:title',
            name: 'twitter:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'twitter:description',
            name: 'twitter:description',
            content: 'Track, discover and find where to watch TV shows and movies.',
        },
        {
            hid: 'twitter:image',
            name: 'twitter:image',
            content: '/backdrop.webp',
        },
        {
            hid: 'twitter:card',
            name: 'twitter:card',
            content: 'summary_large_image',
        },
    ],
});
</script>

<style scoped lang="less">

@media (max-width: 768px) {
    :deep(.carousel) {
        .v-carousel__controls {
            display: none;
        }
    }
}
@media (min-width: 768px) {
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
}
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
</style>
