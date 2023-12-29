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
            <div class="flex justify-between gap-10">
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
                <div class="flex-1 flex items-center">
                    <div class="flex gap-3 items-baseline w-full">
                        <v-slider :min="0" :max="10" :step="1" v-model="queryParams['vote_average.gte']"
                            @update:modelValue="refresh()" label="Rating"/>
                        {{ queryParams['vote_average.gte'] }}+
                    </div>
                </div>
            </div>
            <div class="flex justify-between gap-10">
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
        <div v-if="!isNaN(discoverResults?.total_results)" class="md:ml-16 mt-2 text-neutral-200 text-sm md:text-lg">
            {{ discoverResults?.total_results }} Results
        </div>
        <Grid :items="discoverResults?.results || []" :pending="pending" title="" class="md:px-14"/>
    </div>
</template>

<script setup lang="ts">
const selectedType = ref(0);

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

const queryParams = ref<any>({
    page: 1,
    media_type: 'movie',
    sort_by: 'popularity.desc',
    with_genres: [],
    without_genres: [],
    with_watch_providers: '',
    with_watch_monetization_types: '',
    with_original_language: '',
    with_keywords: '',
    "with_runtime.gte": '',
    "with_runtime.lte": '',
    with_release_type: '',
    "vote_average.gte": 0,
    "vote_count.gte": 0,
    ...{
        ...query,
        with_genres: query.with_genres?.split(',').map(Number),
        without_genres: query.without_genres?.split(',').map(Number),
    }
});

const mediaTypeUpdated = () => {
    queryParams.value.media_type = selectedType.value === 0 ? 'movie' : 'tv';
    queryParams.value.with_genres = [];
    queryParams.value.without_genres = [];
    refresh();
}

const { data: discoverResults, pending, refresh } = await useLazyAsyncData('discover', () => {
    return $fetch('/api/discover', {
        method: 'POST',
        body: JSON.stringify(queryParams.value)
    })}, {
        transform: (data) => {
            const query = Object.keys(queryParams.value).reduce((acc: any, key: any) => {
                if ((queryParams.value[key] !== '') && queryParams.value) {
                    acc[key] = queryParams.value[key];
                }
                return acc;
            }, {});
            console.log(query, data?.results?.length)
            setTimeout(
                () => useRouter().replace({ query })
            )
            return data;
        },
        immediate: true
    }
);
</script>

<style scoped lang="less">
</style>
