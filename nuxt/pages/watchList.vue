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
                <Scroller :items="seriesListData?.currentRunningSeries" title="Running now" :pending="pending" />
                <Scroller :items="seriesListData?.returingSeries" title="Returning Series" :pending="pending" />
                <Scroller :items="seriesListData?.completedSeries" title="Completed" :pending="pending" />
            </div>
            <div v-else-if="selectedType === 1">
                <Grid :items="moviesList" title="" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const selectedType = ref(0);
useHead({
    title: 'Watch List'
})
const { pending, data: seriesListData }: any = await useLazyAsyncData('watchList-series',
    () => $fetch('/api/series/watchList').catch((err) => {
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
                returingSeries
            };
        }
    }
);
const { pending: movieListPending, data: moviesList }: any = await useLazyAsyncData('watchList-series',
    () => $fetch('/api/movie/watchList').catch((err) => {
        console.log(err);
        return [];
    }),
);
</script>
