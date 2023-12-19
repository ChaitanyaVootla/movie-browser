<template>
    <div>
        <div class="top-action flex justify-center mt-10">
            <v-btn-toggle v-model="selectedType">
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
                <div v-if="!seriesListData?.totalCount"
                    class="flex justify-center text-2xl text-neutral-400 items-center mt-20">
                    No Series in your watch list
                </div>
                <div v-else>
                    <Scroller v-if="seriesListData?.currentRunningSeries?.length" :items="seriesListData?.currentRunningSeries"
                        title="Running now" :pending="pending" />
                    <Scroller v-if="seriesListData?.returingSeries?.length" :items="seriesListData?.returingSeries"
                        title="Returning" :pending="pending" />
                    <Scroller v-if="seriesListData?.completedSeries?.length" :items="seriesListData?.completedSeries"
                        title="Completed" :pending="pending" />
                </div>
            </div>
            <div v-else-if="selectedType === 1">
                <Grid v-if="moviesList?.length" :items="moviesList" title="" />
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
const { pending, data: seriesListData } = await useLazyAsyncData('watchList-series',
    () => $fetch('/api/series/watchList', { headers }).catch((err) => {
        console.log(err);
        return {
            currentRunningSeries: [],
            returingSeries: [],
            completedSeries: []
        };
    }),
    {
        transform: (series: any) => {
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
                currentRunningSeries,
                completedSeries,
                returingSeries,
                totalCount: series.length
            };
        }
    }
);
const { pending: movieListPending, data: moviesList } = await useLazyAsyncData('watchList-series',
    () => $fetch('/api/movie/watchList', { headers }).catch((err) => {
        console.log(err);
        return [];
    }),
);
</script>
