<template>
    <div class="px-3 md:px-0">
        <div class="top-action flex justify-center mt-4">
            <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="viewUpdated">
                <v-btn size="default">
                    Series
                </v-btn>
                <v-btn size="default">
                    Movies
                </v-btn>
            </v-btn-toggle>
        </div>
        <div>
            <div v-if="selectedType === 0" class="flex flex-col">
                <div v-if="pending">
                    <Scroller :items="Array(10)" title="" :pending="pending" />
                    <Scroller :items="Array(10)" title="" :pending="pending" />
                    <Scroller :items="Array(10)" title="" :pending="pending" />
                </div>
                <div v-if="watchListData?.series?.totalCount">
                    <Scroller v-if="watchListData?.series?.currentRunningSeries?.length" :items="watchListData?.series?.currentRunningSeries"
                        title="Running now" :pending="pending" />
                    <Scroller v-if="watchListData?.series?.returingSeries?.length" :items="watchListData?.series?.returingSeries"
                        title="Returning" :pending="pending" class="mt-4" />
                    <Scroller v-if="watchListData?.series?.completedSeries?.length" :items="watchListData?.series?.completedSeries"
                        title="Completed" :pending="pending" class="mt-4" />
                </div>
                <div v-else-if="status === 'authenticated'" class="flex justify-center text-2xl text-neutral-400 items-center mt-20">
                    No Series in your watch list
                </div>
                <div v-else>
                    <div class="flex flex-col gap-5 justify-center text-2xl text-neutral-400 items-center mt-20">
                        Login to start adding series to your watch list
                        <NuxtImg @click="signIn('google')" src="/images/googleLogin/login.svg" class="h-10 cursor-pointer" />
                    </div>
                </div>
            </div>
            <div v-else-if="selectedType === 1" class="max-md:px-3 md:px-14">
                <Grid v-if="watchListData?.movies?.length" :items="watchListData?.movies"
                    :title="`${watchListData?.movies?.length} Movies`" />
                <div v-else-if="status === 'authenticated'">
                    <div class="flex justify-center text-2xl text-neutral-400 items-center mt-20">
                        No Movies in your watch list
                    </div>
                </div>
                <div v-else>
                    <div class="flex flex-col gap-5 justify-center text-2xl text-neutral-400 items-center mt-20">
                        Login to start adding movies to your watch list
                        <NuxtImg @click="signIn('google')" src="/images/googleLogin/login.svg" class="h-10 cursor-pointer" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { mapWatchListSeries } from '~/utils/seriesMapper';

const movie = useRoute().query.movie as string;
const selectedType = ref(movie?parseInt(movie):0);
const { status, signIn } = useAuth();

const { pending, data: watchListData, refresh: refreshWatchList } = await useLazyAsyncData('watchList',
    () => {
        // Only fetch if authenticated
        if (status.value === 'authenticated') {
            return $fetch('/api/user/watchList').catch((err) => {
                console.log(err);
                return {
                    movies: [],
                    series: {
                        currentRunningSeries: [],
                        returingSeries: [],
                        completedSeries: [],
                        totalCount: 0
                    }
                };
            });
        }
        return Promise.resolve({
            movies: [],
            series: {
                currentRunningSeries: [],
                returingSeries: [],
                completedSeries: [],
                totalCount: 0
            }
        });
    },
    {
        transform: ({movies, series}: any) => {
            if (!movies && !series) {
                return {
                    movies: [],
                    series: {
                        currentRunningSeries: [],
                        returingSeries: [],
                        completedSeries: [],
                        totalCount: 0
                    }
                };
            }
            return {
                movies,
                series: {
                    ...mapWatchListSeries(series),
                }
            };
        },
        default: () => ({
            movies: [],
            series: {
                currentRunningSeries: [],
                returingSeries: [],
                completedSeries: [],
                totalCount: 0
            }
        }),
        server: false, // Keep client-side for user-specific content
        watch: [status], // Re-fetch when authentication status changes
    }
);

// Watch for authentication status changes and refresh data
watch(status, (newStatus, oldStatus) => {
    if (newStatus === 'authenticated' && oldStatus !== 'authenticated') {
        refreshWatchList();
    }
});

const viewUpdated = (val: number) => {
    useRouter().replace({ query: {
        ...useRoute().query,
        movie: val
    }});
};

useHead({
    title: 'Watch List - The Movie Browser',
    meta: [
        {
            name: 'description',
            content: 'Discover and add movies and series to your watch list.',
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: 'Discover and add movies and series to your watch list.',
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
            content: 'Discover and add movies and series to your watch list.',
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
    ]
});
</script>
