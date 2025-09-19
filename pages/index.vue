<template>
    <!-- SEO-optimized hero section with fallback content -->
    <div v-if="trending?.allItems?.length || pending" class="-mb-5 md:-mb-5">
        <v-carousel color="white" :cycle="true" :interval="10000" hideDelimiterBackground
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
                <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}/${getUrlSlug(item.title || item.name)}`">
                    <DetailsTopInfo :item="item" :watched="false" :minimal="true" />
                </NuxtLink>
            </v-carousel-item>
        </v-carousel>
    </div>
    <div class="mt-5 md:mt-0 p-3 pb-16">
        <Scroller v-if="status === 'authenticated' && continueWatching?.length" :items="continueWatching" :pending="pending"
            title="Continue Watching" class="mb-4 md:pb-5" title-icon="mdi-play-circle-outline">
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
import { movieGenres, seriesGenres } from '~/utils/constants';
import { mapWatchListSeries } from '~/utils/seriesMapper';
import { MOVIE_CATEGORIES } from '~/pages/movie/categories';
import { TV_CATEGORIES } from '~/pages/series/categories';

const { status } = useAuth();
const userData = userStore();

// Create combined watch provider items for scrollers
const watchProviderItems = computed(() => [
    ...MOVIE_CATEGORIES.slice(0, 2), // First few movie categories
    ...TV_CATEGORIES.slice(0, 2)     // First few TV categories
]);

// Optimized for SEO - ensure content loads during SSR
const { pending, data: trending }: any = await useLazyAsyncData('trending',
    () => $fetch('/api/trending').catch((err) => {
        console.log(err);
        return { allItems: [], movies: [], tv: [], streamingNow: [] };
    }),
    {
        transform: (trending: any) => {
            // Ensure we always return a valid structure for SSR
            if (!trending || !trending.allItems) {
                return { allItems: [], movies: [], tv: [], streamingNow: [] };
            }
            
            return {
                ...trending,
                allItems: trending.allItems.map(
                    (item: any) => {
                        if (item.media_type === 'movie') {
                            return {
                                ...item,
                                genres: item.genre_ids?.map((genreId: number) => movieGenres[genreId]) || [],
                            }
                        } else if (item.media_type === 'tv') {
                            return {
                                ...item,
                                genres: item.genre_ids?.map((genreId: number) => seriesGenres[genreId]) || [],
                            }
                        }
                        return item;
                    }
                ).slice(0, 10)
            }
        },
        server: true, // Ensure SSR
        default: () => ({ allItems: [], movies: [], tv: [], streamingNow: [] })
    }
);

// User-specific data with proper SSR handling
const { data: watchList } = await useLazyAsyncData('watchList',
    () => {
        // Only fetch if authenticated
        if (status.value === 'authenticated') {
            return $fetch('/api/user/watchList').catch((err) => {
                console.log(err);
                return {};
            });
        }
        return Promise.resolve({});
    },
    {
        transform: ({movies, series}: any) => {
            if (!movies && !series) return {};
            return {
                movies: movies?.slice(0, 15) || [],
                ongoingSeries: mapWatchListSeries(series)?.currentRunningSeries || []
            };
        },
        default: () => ({ movies: [], ongoingSeries: [] }),
        server: false, // Keep client-side for user-specific content
    }
);

const recents = computed(() => userData.Recents);

const { data: continueWatching }: any = await useLazyAsyncData('continueWatching',
    () => {
        if (status.value === 'authenticated') {
            return $fetch('/api/user/continueWatching').catch((err) => {
                console.log(err);
                return [];
            });
        }
        return Promise.resolve([]);
    },
    {
        default: () => [],
        server: false, // Keep client-side for user-specific content
    }
);

useHead({
    title: SITE_TITLE_TEXT,
    htmlAttrs: {
        lang: 'en'
    },
    link: [
        {
            rel: 'icon',
            type: 'image/x-icon',
            href: '/favicon.ico'
        },
        {
            rel: 'canonical',
            href: 'https://themoviebrowser.com/'
        }
    ],
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
.carousel {
    height: 59vh !important;
}
@media (max-width: 768px) {
    :deep(.carousel) {
        height: calc((100vw * 0.5625) + 12rem) !important;
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
