<template>
    <div>
        <div class="top-action flex justify-center mt-5">
            <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="freshLoad">
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
                        single-line
                        label="Sort By"
                        variant="solo"
                        density="compact"
                        item-title="text"
                        item-value="value"
                        @update:model-value="freshLoad()"
                    ></v-select>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_genres"
                        clearable
                        single-line
                        :items="genres"
                        label="Genres"
                        multiple
                        variant="solo"
                        density="compact"
                        item-title="name"
                        item-value="id"
                        @update:model-value="freshLoad()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_watch_providers"
                        clearable
                        single-line
                        :items="WATCH_PROVIDERS"
                        multiple
                        :chips="true"
                        closable-chips
                        class="singleLineAutocomplete"
                        label="Watch Providers"
                        variant="solo"
                        density="compact"
                        item-title="provider_name"
                        item-value="provider_id"
                        auto-select-first
                        @update:model-value="freshLoad()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1 flex items-center">
                    <v-select
                        v-model="queryParams['vote_average.gte']"
                        :items="ratingOptions"
                        single-line
                        label="Rating"
                        variant="solo"
                        density="compact"
                        item-title="text"
                        item-value="value"
                        clearable
                        @update:model-value="freshLoad()"
                    ></v-select>
                </div>
            </div>
            <div class="flex justify-between gap-3 md:gap-5 flex-wrap">
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_original_language"
                        clearable
                        single-line
                        :items="LANGAUAGES"
                        label="Language"
                        variant="solo"
                        density="compact"
                        item-title="english_name"
                        item-value="iso_639_1"
                        @update:model-value="freshLoad()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.without_genres"
                        clearable
                        single-line
                        :items="genres"
                        label="Exclude Genres"
                        multiple
                        variant="solo"
                        density="compact"
                        item-title="name"
                        item-value="id"
                        @update:model-value="freshLoad()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-autocomplete
                        v-model="queryParams.with_keywords"
                        clearable
                        single-line
                        :items="filteredKeywords"
                        class="singleLineAutocomplete"
                        @update:search="searchKeywords"
                        chips
                        closable-chips
                        no-filter
                        multiple
                        return-object
                        label="Keywords"
                        variant="solo"
                        density="compact"
                        item-title="name"
                        item-value="id"
                        @update:model-value="freshLoad()"
                    ></v-autocomplete>
                </div>
                <div class="flex-1">
                    <v-text-field
                        v-model="queryParams['vote_count.gte']"
                        type="number"
                        single-line
                        @update:model-value="freshLoad()"
                        placeholder="Minimum votes"
                        variant="solo"
                        density="compact"
                        label="Minimum Votes"
                    ></v-text-field>
                </div>
            </div>
        </div>
        <div v-if="status === 'authenticated'" class="max-md:px-3 md:px-14">
            <v-btn size="small" rounded @click="isFilterDialogActive = true" color="#aaa" class="text-black">
                Create Filter
            </v-btn>
            <div class="flex gap-2 w-full mt-3">
                <v-chip v-if="userFilters.length" v-for="filter in userFilters" rounded @click="selectFilter(filter)"
                    closable @click:close="deleteFilter(filter)">
                    {{ filter.name }}
                </v-chip>
            </div>
        </div>
        <div v-if="!pending" class="max-md:ml-3 md:ml-16 mt-2 text-neutral-200 text-sm md:text-lg">
            {{ Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(
                totalResults,
            )}} Results
        </div>
        <Grid :items="discoverResults || []" :pending="pending" title="" class="max-md:px-3 md:px-14"/>
        <div v-if="discoverResults.length && canShowLoadMore" class="w-full flex justify-center">
            <v-btn @click="loadMore()" :loading="pending">Load More</v-btn>
        </div>
        <v-dialog width="500" v-model="isFilterDialogActive">
            <v-card title="Create Filter" class="px-4">
                <div class="mt-5">
                    <v-text-field
                        label="Filter name"
                        v-model="filterName"
                    />
                </div>
                <v-card-actions class="h-20">
                    <v-btn
                        variant="text"
                        text="Cancel"
                        color="red"
                        @click="isFilterDialogActive = false"
                    ></v-btn>
                    <v-spacer></v-spacer>
                    <v-btn @click="saveFilter" :disabled="!filterName?.length">
                        Save
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
import { useAuth } from '#imports';

let selectedType = ref(0);
let pending = ref(true);
let canShowLoadMore = ref(true);
let isFilterDialogActive = ref(false);
let discoverResults = ref([] as any[]);
let selectedKeywords = ref([] as any[]);
let keywordSearchResults = ref([] as any[]);
let userFilters = ref([] as any[]);
let filterName = ref('');
let filteredKeywords = computed(() => {
    return [...keywordSearchResults.value, ...selectedKeywords.value];
});
let totalResults = ref(0);
const { status } = useAuth();

const fetchFilters = async () => {
    userFilters.value = await $fetch('/api/user/filters');
}

onMounted(() => {
    fetchFilters();
});

const genres = computed(() => {
    return selectedType.value === 0 ? Object.values(movieGenres) : Object.values(seriesGenres);
});

const sortByValues = [
    { text: 'Popularity', value: 'popularity.desc' },
    { text: 'Rating', value: 'vote_average.desc' },
    { text: 'Release Date', value: 'release_date.desc' },
    { text: 'Revenue', value: 'revenue.desc' },
];

let query = {} as any;
if (useRouter().currentRoute.value?.query?.discover?.length) {
    query = JSON.parse(decodeURIComponent(atob(useRouter().currentRoute.value?.query?.discover as string))) as any;
    if (query.with_keywords?.length) {
        selectedKeywords.value = query.with_keywords;
    }
}
if (query.media_type === 'tv') {
    selectedType.value = 1;
}

const ratingOptions = new Array(10).fill({}).map((item, index) => ({
    value: index,
    text: `${index}+`,
})).reverse();

let pageTrack = 1;

const freshLoad = async () => {
    pageTrack = 1;
    canShowLoadMore.value = true;
    discoverResults.value = [];
    queryParams.value.media_type = selectedType.value === 0 ? 'movie' : 'tv';
    totalResults.value = (await loadData()).total_results as number;
}

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
    ...query,
});

const loadData = async () => {
    pending.value = true;
    const query = {
        ...queryParams.value,
        with_keywords: queryParams.value.with_keywords.map((item: any) => item.id),
    }
    const [page1, page2]: any = await Promise.all([
        $fetch('/api/discover', {
            method: 'POST',
            body: JSON.stringify({
                ...query,
                page: pageTrack,
            })
        }),
        $fetch('/api/discover', {
            method: 'POST',
            body: JSON.stringify({
                ...query,
                page: ++pageTrack
            })
        })
    ]);
    const data = {
        total_results: page1?.total_results,
        results: [...(page1?.results || []), ...(page2?.results || [])]
    } as {
        total_results: number;
        results: any[];
    };
    setTimeout(
        () => useRouter().replace({
            query: {
                discover: btoa(encodeURIComponent(JSON.stringify(queryParams.value)))
            }
        })
    );
    if (data.results.length < 40) {
        canShowLoadMore.value = false;
    };
    discoverResults.value = discoverResults.value.concat(data.results);
    pending.value = false;
    return data;
}

totalResults.value = (await loadData()).total_results as number;

const loadMore = async () => {
    loadData();
}

const searchKeywords = async (search: string) => {
    if (!search || search.length < 3) {
        keywordSearchResults.value = [];
        return;
    }
    const results = await $fetch(`/api/keywords?query=${search}`);
    keywordSearchResults.value = results;
}

const selectFilter = (filter: any) => {
    queryParams.value = filter.filterParams;
    freshLoad();
}

const deleteFilter = async (filter: any) => {
    await $fetch('/api/user/filters', {
        method: 'DELETE',
        body: {
            id: filter._id,
        }
    });
    fetchFilters();
}

const saveFilter = async () => {
    await $fetch('/api/user/filters', {
        method: 'POST',
        body: JSON.stringify({
            name: filterName.value,
            filterParams: queryParams.value,
            isGlobal: false,
        })
    });
    isFilterDialogActive.value = false;
}

useHead({
    title: 'Discover - The Movie Browser',
    meta: [
        {
            name: 'description',
            content: 'Discover movies and series with the most advanced filters.'
        },
        {
            hid: 'og:title',
            property: 'og:title',
            content: 'The Movie Browser',
        },
        {
            hid: 'og:description',
            property: 'og:description',
            content: 'Discover movies and series with the most advanced filters.'
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
            content: 'Discover movies and series with the most advanced filters.'
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

<style scoped lang="less">
.singleLineAutocomplete {
    :deep(.v-field__input) {
        display: -webkit-box;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
    }
}
</style>
