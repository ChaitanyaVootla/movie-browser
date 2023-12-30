<template>
    <div>
        <div class="top-action flex justify-center mt-5">
            <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="mediaTypeUpdated">
                <v-btn>
                    Movies
                </v-btn>
                <v-btn>
                    Series
                </v-btn>
            </v-btn-toggle>
        </div>

        <div class="mt-5 px-3 md:mx-12">
            <div class="flex justify-between gap-3 md:gap-5 flex-wrap">
                <div class="flex-1">
                    <v-select
                        v-model="queryParams.sort_by"
                        :items="sortByValues"
                        label="Sort By"
                        variant="solo"
                        density="comfortable"
                        item-title="text"
                        item-value="value"
                        @update:model-value="refresh()"
                    ></v-select>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_genres"
                        clearable
                        :items="genres"
                        label="Genres"
                        multiple
                        variant="solo"
                        density="comfortable"
                        item-title="name"
                        item-value="id"
                        @update:model-value="refresh()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_watch_providers"
                        clearable
                        :items="WATCH_PROVIDERS"
                        multiple
                        label="Watch Providers"
                        variant="solo"
                        density="comfortable"
                        item-title="provider_name"
                        item-value="provider_id"
                        auto-select-first
                        @update:model-value="refresh()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1 flex items-center">
                    <v-select
                        v-model="queryParams['vote_average.gte']"
                        :items="ratingOptions"
                        label="Rating"
                        variant="solo"
                        density="comfortable"
                        item-title="text"
                        item-value="value"
                        clearable
                        @update:model-value="refresh()"
                    ></v-select>
                </div>
            </div>
            <div class="flex justify-between gap-3 md:gap-5 flex-wrap">
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_original_language"
                        clearable
                        :items="LANGAUAGES"
                        label="Language"
                        variant="solo"
                        density="comfortable"
                        item-title="english_name"
                        item-value="iso_639_1"
                        @update:model-value="refresh()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.without_genres"
                        clearable
                        :items="genres"
                        label="Exclude Genres"
                        multiple
                        variant="solo"
                        density="comfortable"
                        item-title="name"
                        item-value="id"
                        @update:model-value="refresh()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_keywords"
                        clearable
                        :items="KEYWORDS"
                        multiple
                        label="Keywords"
                        variant="solo"
                        density="comfortable"
                        item-title="name"
                        item-value="id"
                        auto-select-first
                        @update:model-value="refresh()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-text-field
                        v-model="queryParams['vote_count.gte']"
                        type="number"
                        @update:model-value="refresh()"
                        placeholder="Minimum votes"
                        variant="solo"
                        density="comfortable"
                        label="Minimum Votes"
                    ></v-text-field>
                </div>
            </div>
        </div>
        <div v-if="!isNaN(data?.total_results)" class="md:ml-16 mt-2 text-neutral-200 text-sm md:text-lg">
            {{ data?.total_results }} Results
        </div>
        <Grid :items="discoverResults || []" :pending="pending" title="" class="max-md:px-3 md:px-14"/>
        <div v-if="discoverResults.length && canShowLoadMore" class="w-full flex justify-center">
            <v-btn @click="loadMore()" :loading="pending">Load More</v-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
const selectedType = ref(0);
const canShowLoadMore = ref(true);
const discoverResults = ref([]);

const genres = computed(() => {
    return selectedType.value === 0 ? Object.values(movieGenres) : Object.values(seriesGenres);
});

const sortByValues = [
    { text: 'Popularity', value: 'popularity.desc' },
    { text: 'Rating', value: 'vote_average.desc' },
    { text: 'Release Date', value: 'release_date.desc' },
    { text: 'Revenue', value: 'revenue.desc' },
];

const query = useRouter().currentRoute.value.query as any;
if (query.media_type === 'tv') {
    selectedType.value = 1;
}

const ratingOptions = new Array(10).fill({}).map((item, index) => ({
    value: index,
    text: `${index}+`,
})).reverse();

let page = 0;

const queryParams = ref<any>({
    media_type: 'movie',
    sort_by: 'popularity.desc',
    with_genres: [],
    with_keywords: [],
    with_original_language: null,
    without_genres: [],
    with_watch_providers: [],
    with_watch_monetization_types: '',
    // TODO udpate with user region
    watch_region: 'IN',
    "with_runtime.gte": '',
    "with_runtime.lte": '',
    with_release_type: '',
    "vote_average.gte": null,
    "vote_count.gte": null,
    ...{
        ...query,
        with_genres: query.with_genres?.split(',').map(Number),
        without_genres: query.without_genres?.split(',').map(Number),
        with_watch_providers: query.with_watch_providers?.split(',').map(Number),
        with_keywords: query.with_keywords?.split(',').map(Number),
    }
});

const mediaTypeUpdated = () => {
    queryParams.value.media_type = selectedType.value === 0 ? 'movie' : 'tv';
    queryParams.value.with_genres = [];
    queryParams.value.without_genres = [];
    refresh();
}

const { data, pending, refresh } = await useLazyAsyncData('discover', async () => {
        const [page1, page2]: any = await Promise.all([
            $fetch('/api/discover', {
                method: 'POST',
                body: JSON.stringify({
                    ...queryParams.value,
                    page: ++page
                })
            }),
            $fetch('/api/discover', {
                method: 'POST',
                body: JSON.stringify({
                    ...queryParams.value,
                    page: ++page
                })
            })
        ]);
        return {
            total_results: page1?.total_results,
            results: [...(page1?.results || []), ...(page2?.results || [])]
        };
    },
    {
        transform: (data: any) => {
            const query = Object.keys(queryParams.value).reduce((acc: any, key: any) => {
                if ((queryParams.value[key] !== '') && queryParams.value) {
                    acc[key] = queryParams.value[key];
                }
                return acc;
            }, {});
            setTimeout(
                () => useRouter().replace({ query })
            );
            if (data.results.length < 40) {
                canShowLoadMore.value = false;
            };
            discoverResults.value = discoverResults.value.concat(data.results);
            return data;
        },
        immediate: true
    }
);

const loadMore = async () => {
    refresh();
}
</script>

<style scoped lang="less">
</style>
