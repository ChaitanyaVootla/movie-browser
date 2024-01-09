<template>
    <div>
        <div class="bg-neutral-900 pt-5 mb-3 pb-5">
            <div class="top-action flex justify-center">
                <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="freshLoad">
                    <v-btn>
                        Movies
                    </v-btn>
                    <v-btn>
                        Series
                    </v-btn>
                </v-btn-toggle>
            </div>

            <div class="mt-5 max-md:mx-3 md:mx-14">
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
                <div v-if="userFilters.length" class="flex flex-wrap gap-2 w-full">
                    <v-chip variant="flat" color="#444" prepend-icon="mdi-plus" @click="openCreateFilter"
                        :disabled="selectedFilter._id" >
                        Create Filter
                    </v-chip>
                    <div v-for="filter in userFilters">
                        <v-chip v-if="selectedFilter._id !== filter._id" @click="selectFilter(filter)" class="rounded !text-white"
                            variant="flat" color="#333">
                            <v-icon v-if="filter.isGlobal" icon="mdi-earth" class="mr-2" color="#aaa"></v-icon>
                            {{ filter.name }}
                        </v-chip>
                        <div v-else>
                            <v-chip :rounded="false" class="rounded !cursor-pointer group" color="#555" variant="flat">
                                <v-icon v-if="filter.isGlobal" icon="mdi-earth" class="mr-2" color="#aaa"></v-icon>
                                <div @click="selectFilter(filter)">
                                    {{ filter.name }}
                                </div>
                                <v-divider :vertical="true" thickness="2" class="mx-2"></v-divider>
                                <div class="hover:scale-105" @click="editFilter(filter)">
                                    Update
                                </div>
                                <v-divider :vertical="true" thickness="2" class="mx-2"></v-divider>
                                <div class="text-red-400 hover:scale-105" @click="deleteFilter(filter)">
                                    Delete
                                </div>
                            </v-chip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-if="globalFilters.length" class="flex flex-wrap gap-2 w-full max-md:mx-3 md:mx-14">
            <div v-for="filter in globalFilters">
                <v-chip @click="selectGlobalFilter(filter)" rounded class="!text-white"
                    variant="flat" :color="selectedGlobalFilter._id === filter._id?'#666':'#333'">
                    {{ filter.name }}
                </v-chip>
            </div>
        </div>
        <div v-if="!pending" class="max-md:ml-3 md:ml-14 text-neutral-200 max-md:text-sm md:text-base mt-3">
            {{ Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(totalResults) }} Results
        </div>
        <Grid :items="discoverResults || []" :pending="pending" title="" class="max-md:px-3 md:px-14"/>
        <div v-if="discoverResults.length && canShowLoadMore" class="w-full flex justify-center">
            <v-btn @click="loadMore()" :loading="pending">Load More</v-btn>
        </div>
        <v-dialog width="500" v-model="isFilterDialogActive">
            <v-card :title="selectedFilter._id?'Update Filter':'Create Filter'">
                <div class="mt-5 px-4">
                    <v-text-field
                        label="Filter name"
                        v-model="filterName"
                        :disabled="selectedFilter._id"
                    />
                    <v-checkbox label="Make Public" v-model="isGlobal"></v-checkbox>
                </div>
                <v-card-actions class="h-20">
                    <v-btn
                        variant="text"
                        text="Cancel"
                        color="red"
                        @click="isFilterDialogActive = false"
                    ></v-btn>
                    <v-spacer></v-spacer>
                    <v-btn v-if="selectedFilter._id" @click="updateFilter" :disabled="!filterName?.length">
                        Update
                    </v-btn>
                    <v-btn v-else @click="saveFilter" :disabled="!filterName?.length">
                        Create
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
import { useAuth } from '#imports';
import { baseDiscoverQuery } from '~/utils/constants';

let selectedType = ref(0);
let pending = ref(true);
let canShowLoadMore = ref(true);
let isFilterDialogActive = ref(false);
let discoverResults = ref([] as any[]);
let selectedKeywords = ref([] as any[]);
let keywordSearchResults = ref([] as any[]);
let userFilters = ref([] as any[]);
let selectedFilter = ref({} as any);
let selectedGlobalFilter = ref({} as any);
let filterName = ref('');
let isGlobal = ref(false);
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

const { data: globalFilters, refresh: refreshGlobalFilters }: any = useLazyAsyncData('globalFilters', async () => {
    return await $fetch('/api/filters');
}, {
    default: () => ([] as any[])
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
    ...baseDiscoverQuery,
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

const openCreateFilter = () => {
    filterName.value = '';
    isGlobal.value = false;
    isFilterDialogActive.value = true
}

const clearFilter = () => {
    selectedFilter.value = {};
    selectedGlobalFilter.value = {};
    queryParams.value = baseDiscoverQuery;
    freshLoad();
}

const editFilter = (filter: any) => {
    filterName.value = filter.name;
    isGlobal.value = filter.isGlobal;
    isFilterDialogActive.value = true;
}

const selectFilter = (filter: any) => {
    selectedGlobalFilter.value = {};
    if (selectedFilter.value._id === filter._id) {
        clearFilter();
    } else {
        selectedFilter.value = filter;
        queryParams.value = filter.filterParams;
        selectedType.value = queryParams.value.media_type === 'movie' ? 0 : 1;
    }
    freshLoad();
}

const selectGlobalFilter = (filter: any) => {
    selectedFilter.value = {};
    if (selectedGlobalFilter.value._id === filter._id) {
        clearFilter();
    } else {
        selectedGlobalFilter.value = filter;
        queryParams.value = filter.filterParams;
        selectedType.value = queryParams.value.media_type === 'movie' ? 0 : 1;
    }
    freshLoad();
}

const deleteFilter = async (filter: any) => {
    await $fetch('/api/user/filters', {
        method: 'DELETE',
        body: {
            id: filter._id,
        }
    });
    clearFilter();
    fetchFilters();
    refreshGlobalFilters();
}

const updateFilter = async () => {
    await $fetch('/api/user/filters', {
        method: 'PUT',
        body: JSON.stringify({
            _id: selectedFilter.value._id,
            filterParams: queryParams.value,
            isGlobal: isGlobal.value,
        })
    });
    isFilterDialogActive.value = false;
    fetchFilters();
    refreshGlobalFilters();
}

const saveFilter = async () => {
    await $fetch('/api/user/filters', {
        method: 'POST',
        body: JSON.stringify({
            name: filterName.value,
            filterParams: queryParams.value,
            isGlobal: isGlobal.value,
        })
    });
    isFilterDialogActive.value = false;
    fetchFilters();
    refreshGlobalFilters();
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
