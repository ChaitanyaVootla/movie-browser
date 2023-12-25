<template>
    <div class="px-3 md:px-0">
        <div class="top-action flex justify-center mt-10">
            <v-btn-toggle v-model="selectedType" mandatory>
                <v-btn>
                    Series
                </v-btn>
                <v-btn>
                    Movies
                </v-btn>
            </v-btn-toggle>
        </div>
        <div v-if="pending">

        </div>
        <div v-else>
            <div v-if="selectedType === 0" class="flex flex-col gap-10 mb-14">
                <div v-if="watchListData?.series?.totalCount === 0"
                    class="flex justify-center text-2xl text-neutral-400 items-center mt-20">
                    No Series in your watch list
                </div>
                <div>
                    <Scroller v-if="watchListData?.series?.currentRunningSeries?.length" :items="watchListData?.series?.currentRunningSeries"
                        title="Running now" :pending="pending" />
                    <Scroller v-if="watchListData?.series?.returingSeries?.length" :items="watchListData?.series?.returingSeries"
                        title="Returning" :pending="pending" />
                    <Scroller v-if="watchListData?.series?.completedSeries?.length" :items="watchListData?.series?.completedSeries"
                        title="Completed" :pending="pending" />
                </div>
            </div>
            <div v-else-if="selectedType === 1">
                <Grid v-if="watchListData?.movies?.length" :items="watchListData?.movies" title="" />
                <div v-else>
                    <div class="flex justify-center text-2xl text-neutral-400 items-center mt-20">
                        No Movies in your watch list
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const selectedType = ref(0);
useHead({
    title: 'Watch List'
})
const headers = useRequestHeaders(['cookie']) as HeadersInit
const { pending, data: watchListData } = await useLazyAsyncData('watchList',
    () => $fetch('/api/user/watchList', { headers }).catch((err) => {
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
    }),
    {
        transform: ({movies, series}: any) => {
            const currentRunningSeries = [] as any[];
            const returingSeries = [] as any[];
            const completedSeries = [] as any[];
            series.forEach((item: any) => {
                if (item.status === 'Canceled') {
                    completedSeries.push(item);
                } else {
                    if (item.next_episode_to_air) {
                        currentRunningSeries.push(item);
                    } else {
                        returingSeries.push(item);
                    }
                }
            });
            return {
                movies,
                series: {
                    currentRunningSeries,
                    completedSeries,
                    returingSeries,
                    totalCount: series.length
                }
            };
        }
    }
);
</script>
