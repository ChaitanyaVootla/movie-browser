<template>
    <div v-if="trending?.allItems?.length" class="-mb-5 md:-mb-5">
        <v-carousel :height="$vuetify.display.mobile?'calc((100vw * 0.5625) + 12rem)':'59vh'" color="white" :cycle="true" :interval="10000" hideDelimiterBackground
            delimiterIcon="mdi-circle-medium" class="carousel" :key="trending?.allItems?.length">
            <template v-slot:prev="{ props }">
                <div class="w-12 h-full cursor-pointer flex justify-center items-center group" @click="props.onClick">
                    <v-icon icon="mdi-chevron-left" class="group-hover:scale-150"></v-icon>
                </div>
            </template>
            <template v-slot:next="{ props }">
                <div class="w-12 h-full cursor-pointer flex justify-center items-center group" @click="props.onClick">
                    <v-icon icon="mdi-chevron-right" class="group-hover:scale-150"></v-icon>
                </div>
            </template>
            <v-carousel-item v-for="item in trending?.allItems">
                <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`">
                    <DetailsTopInfo :item="item" :watched="false" :minimal="true" />
                </NuxtLink>
            </v-carousel-item>
        </v-carousel>
    </div>
    <div class="mt-5 md:mt-0 p-3 pb-16">
        <Scroller v-if="status === 'authenticated' && continueWatching?.length" :items="continueWatching" :pending="pending"
            title="Continue Watching" class="mb-1 md:pb-5" titleIcon="mdi-play-circle-outline">
            <template v-slot:default="{ item }">
                <WatchCard :item="item" class="mr-3" />
            </template>
        </Scroller>
        <Scroller :items="trending?.movies" :pending="pending" title="Trending Movies" class="mb-1 md:pb-5"
            title-icon="mdi-movie-open-outline"/>
        <Scroller v-if="status === 'authenticated' && watchList?.ongoingSeries?.length" :items="watchList.ongoingSeries"
            :pending="false" title="Upcoming Episodes" class="mb-1 md:pb-5" title-icon="mdi-television-classic"/>
        <Scroller :items="trending?.tv" :pending="pending" title="Trending Series" class="mb-1 md:pb-5"
            title-icon="mdi-television-classic"/>
        <Scroller v-if="status === 'authenticated' && watchList?.movies?.length" :items="watchList.movies" :pending="false"
            title="Movies in your watch list" class="mb-1 md:pb-5" title-icon="mdi-movie-open-outline"/>
        <Scroller :items="trending?.streamingNow" :pending="pending" title="Streaming Now" class="mb-1 md:pb-5"
            title-icon="mdi-movie-open-outline">
            <template v-slot:default="{ item }">
                <PromoCard  :item="item" class="mr-3" />
            </template>
        </Scroller>
        <Scroller v-if="status === 'authenticated' && recents?.length" :items="recents" :pending="pending" title="Recent visits" class="mb-1 md:pb-5"
            title-icon="mdi-history">
            <template v-slot:default="{ item }">
                <WideCard :item="item" class="mr-3" />
            </template>
        </Scroller>
        <ScrollProvider v-for="scrollItem in watchProviderItems" :scroll-item="scrollItem" />
    </div>
</template>
<script setup lang="ts">
import { useAuth } from '#imports'
import { userStore } from '~/plugins/state';
import { SITE_TITLE_TEXT } from '~/utils/constants';

const { status } = useAuth();
const userData = userStore();

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
                ).slice(0, 10)
            }
        },
    }
);

const { data: watchList, execute: executeWatchList } = await useLazyAsyncData('watchList',
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

const recents = computed(() => userData.Recents);

const { data: continueWatching, execute: executeContinueWatching }: any = await useLazyAsyncData('continueWatching',
    () => $fetch('/api/user/continueWatching').catch((err) => {
        console.log(err);
        return {};
    }),
);

setTimeout(() => {
    executeWatchList();
    executeContinueWatching();
});

useHead({
    title: SITE_TITLE_TEXT,
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
:deep(.v-window__controls) {
    padding: 0;
}
:deep(.carousel) {
    .v-btn--icon.v-btn--density-default {
        width: 1.2rem;
        height: 1.2rem;
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
