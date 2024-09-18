<template>
    <div class="flex max-h-scren w-full overflow-y-auto">
        <div v-if="$vuetify.display.mdAndUp || filtersVisible" id="filters"
            class="w-[calc(15%)] min-w-60 h-full bg-neutral-900 px-4"
            :class="{'!w-screen': filtersVisible}">
            <div class="top-action flex justify-center mb-6 mt-6">
                <v-btn-toggle v-model="selectedType" mandatory density="compact" @update:model-value="freshLoad"
                    class="!h-8">
                    <v-btn density="compact" size="small">
                        Movies
                    </v-btn>
                    <v-btn density="compact" size="small">
                        Series
                    </v-btn>
                </v-btn-toggle>
            </div>

            <div class="flex flex-col gap-6">
                <v-autocomplete
                    v-model="queryParams.with_genres"
                    clearable
                    single-line
                    :items="genres"
                    label="Genres"
                    hint="Action, Comedy etc."
                    persistent-hint
                    multiple
                    variant="outlined"
                    density="compact"
                    item-title="name"
                    item-value="id"
                    @update:model-value="freshLoad()"
                ></v-autocomplete>
                <v-autocomplete
                    v-model="queryParams.with_watch_providers"
                    clearable
                    single-line
                    :items="WATCH_PROVIDERS"
                    multiple
                    :chips="true"
                    closable-chips
                    label="Watch Providers"
                    hint="Netflix, Amazon Prime etc."
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="provider_name"
                    item-value="provider_id"
                    auto-select-first
                    @update:model-value="freshLoad()"
                >
                    <template v-slot:item="{ props, item }">
                        <v-list-item
                            v-bind="props"
                            :prepend-avatar="`https://image.tmdb.org/t/p/${configuration.images.logo_sizes.w45}${item.raw.logo_path}`"
                            :title="item.raw.provider_name"
                            density="compact"
                        ></v-list-item>
                    </template>
                </v-autocomplete>
                <v-autocomplete
                    v-model="queryParams.with_keywords"
                    clearable
                    single-line
                    :items="filteredKeywords"
                    @update:search="searchKeywords"
                    chips
                    closable-chips
                    no-filter
                    multiple
                    return-object
                    label="Keywords"
                    hint="Zombie, Serial killer etc."
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="name"
                    item-value="id"
                    @update:model-value="freshLoad()"
                ></v-autocomplete>
                <v-select
                    v-model="queryParams['vote_average.gte']"
                    :items="ratingOptions"
                    single-line
                    label="Rating"
                    hint="Minimum Rating"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="text"
                    item-value="value"
                    clearable
                    @update:model-value="freshLoad()"
                ></v-select>
                <v-autocomplete
                    v-model="queryParams.with_original_language"
                    clearable
                    single-line
                    :items="LANGAUAGES"
                    label="Language"
                    hint="Original Language, English, Hindi etc."
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="english_name"
                    item-value="iso_639_1"
                    @update:model-value="freshLoad()"
                ></v-autocomplete>
                <v-autocomplete
                    v-if="selectedType !== 1"
                    v-model="queryParams.with_cast"
                    clearable
                    single-line
                    :items="filteredCast"
                    @update:search="searchPersons"
                    chips
                    closable-chips
                    no-filter
                    multiple
                    return-object
                    label="Cast"
                    hint="Filter by Actors ex: Tom Cruise"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="name"
                    item-value="id"
                    @update:model-value="freshLoad()"
                >
                    <template v-slot:item="{ props, item }">
                        <v-list-item
                            v-bind="props"
                            :prepend-avatar="`https://image.tmdb.org/t/p/${configuration.images.profile_sizes.w185}${item.raw.profile_path}`"
                            :title="item.raw.name"
                            :subtitle="item.raw.known_for_department"
                            density="default"
                        ></v-list-item>
                    </template>
                </v-autocomplete>
                <v-autocomplete
                    v-if="selectedType !== 1"
                    v-model="queryParams.with_crew"
                    clearable
                    single-line
                    :items="filteredCrew"
                    @update:search="searchPersons"
                    chips
                    closable-chips
                    no-filter
                    multiple
                    return-object
                    label="Crew"
                    hint="Filter by crew members ex: Director"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    item-title="name"
                    item-value="id"
                    @update:model-value="freshLoad()"
                >
                    <template v-slot:item="{ props, item }">
                        <v-list-item
                            v-bind="props"
                            :prepend-avatar="`https://image.tmdb.org/t/p/${configuration.images.profile_sizes.w185}${item.raw.profile_path}`"
                            :title="item.raw.name"
                            :subtitle="item.raw.known_for_department"
                            density="default"
                        ></v-list-item>
                    </template>
                </v-autocomplete>
                <v-autocomplete
                    v-model="queryParams.without_genres"
                    clearable
                    single-line
                    :items="genres"
                    label="Exclude Genres"
                    hint="Exclude Action, Comedy etc."
                    persistent-hint
                    multiple
                    variant="outlined"
                    density="compact"
                    item-title="name"
                    item-value="id"
                    @update:model-value="freshLoad()"
                ></v-autocomplete>
                <v-text-field
                    v-model="queryParams['vote_count.gte']"
                    type="number"
                    single-line
                    @update:model-value="freshLoad()"
                    placeholder="Minimum votes"
                    hint="Minimum votes casted, could be used to filter out less popular movies"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    label="Minimum Votes"
                ></v-text-field>
            </div>
            
            <div class="flex justify-center mt-10">
                <v-chip variant="flat" color="#444" prepend-icon="mdi-plus" @click="openCreateFilter"
                    :disabled="selectedFilter._id">
                    Create Topic
                </v-chip>
            </div>
        </div>
        <div v-if="!filtersVisible" class="w-full pt-2 md:pt-4 mainContent pb-10">
            <div class="max-md:px-3 md:px-10 md:mb-2">
                <div class="flex gap-2 w-full md:w-[calc(100vw-23rem)] overflow-x-auto">
                    <div v-if="status === 'authenticated' && userFilters.length" v-for="filter in userFilters">
                        <v-chip v-if="selectedFilter._id !== filter._id" @click="selectFilter(filter)" class="rounded !text-white"
                            variant="flat" color="#333" :size="$vuetify.display.mdAndDown?'small':'default'">
                            <v-icon v-if="filter.isGlobal" icon="mdi-earth" class="mr-1 md:mr-2 max-md:mt-[1px]" color="#aaa"></v-icon>
                            {{ filter.name }}
                        </v-chip>
                        <div v-else>
                            <v-chip :rounded="false" class="rounded !cursor-pointer group" color="#555" variant="flat"
                                :size="$vuetify.display.mdAndDown?'small':'default'">
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
                    <div v-for="filter in globalFilters">
                        <v-chip @click="selectGlobalFilter(filter)" rounded class="!text-white" :size="$vuetify.display.mdAndDown?'small':'default'"
                            variant="flat" :color="selectedGlobalFilter._id === filter._id?'#666':'#333'">
                            <v-icon :icon="filter?.filterParams?.media_type === 'movie'?'mdi-movie-open-outline':'mdi-television-classic'"
                                class="mr-2" />
                            {{ filter.name }}
                        </v-chip>
                    </div>
                </div>
            </div>
            <Grid :items="filteredDiscoveryResults || []" :pending="pending" title="" class="max-md:mx-3 md:mx-10">
                <template v-slot:sortaction>
                    <div class="flex items-center gap-6">
                        <v-checkbox
                            v-model="queryParams.hide_watched"
                            @update:model-value="freshLoad()"
                            color="white"
                            label="Hide Watched"
                            density="compact"
                            hide-details
                            class="!h-8 !text-sm"
                        ></v-checkbox>
                        <v-select
                            v-model="queryParams.sort_by"
                            hide-details
                            :items="sortByValues"
                            single-line
                            label="Sort By"
                            variant="plain"
                            rounded
                            density="compact"
                            item-title="text"
                            item-value="value"
                            class="sort-by-dropdown"
                            @update:model-value="freshLoad()"
                        >
                            <template v-slot:selection="{ item, index }">
                                <span v-if="$vuetify.display.mdAndUp" class="text-xs text-neutral-300 mr-2">Sort By</span>
                                <span class="text-xs md:text-sm">{{ item.title }}</span>
                            </template>
                        </v-select>
                    </div>
                </template>
                <template v-slot:default="{}">
                    <div v-if="!pending && $vuetify.display.mdAndUp" class="text-neutral-200 text-sm mr-5">
                        {{ Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(totalResults) }} results
                    </div>
                </template>
            </Grid>
            <div v-if="discoverResults.length && canShowLoadMore" class="w-full flex justify-center">
                <v-btn @click="loadMore()" :loading="pending">Load More</v-btn>
            </div>
        </div>
    </div>
    <div v-if="$vuetify.display.mdAndDown" @click="showFilter"
        class="h-10 flex items-center justify-center fixed bottom-14 w-full">
        <div class="rounded-xl z-[100] shadow-lg shadow-black px-5 py-1 bg-neutral-700">
            <v-icon :icon="filtersVisible?'mdi-close':'mdi-filter-variant'"></v-icon>
            {{filtersVisible?'Apply':'Filters'}}
        </div>
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
</template>

<script setup lang="ts">
import { useAuth } from '#imports';
import _ from 'lodash';
import { userStore } from '~/plugins/state';
import { baseDiscoverQuery } from '~/utils/constants';

let selectedType = ref(0);
let pending = ref(true);
let canShowLoadMore = ref(true);
let filtersVisible = ref(false);
let isFilterDialogActive = ref(false);
let discoverResults = ref([] as any[]);
let selectedKeywords = ref([] as any[]);
let selectedCast = ref([] as any[]);
let selectedCrew = ref([] as any[]);
let keywordSearchResults = ref([] as any[]);
let castSearchResults = ref([] as any[]);
let crewSearchResults = ref([] as any[]);
let userFilters = ref([] as any[]);
let selectedFilter = ref({} as any);
let selectedGlobalFilter = ref({} as any);
let filterName = ref('');
let isGlobal = ref(false);
const isAtEnd = ref(false)
const userData = userStore();

let filteredKeywords = computed(() => {
    return [...keywordSearchResults.value, ...selectedKeywords.value];
});
let filteredCast = computed(() => {
    return [...castSearchResults.value, ...selectedCast.value];
});
let filteredCrew = computed(() => {
    return [...crewSearchResults.value, ...selectedCrew.value];
});
let totalResults = ref(0);
const { status } = useAuth();

const fetchFilters = async () => {
    userFilters.value = await $fetch('/api/user/filters');
}

onMounted(() => {
    fetchFilters();
});

const showFilter = () => {
    filtersVisible.value = !filtersVisible.value;
}

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
    { text: 'Newest', value: 'release_date.desc' },
    { text: 'Oldest', value: 'release_date.asc' },
    { text: 'Revenue', value: 'revenue.desc' },
    { text: 'Vote count', value: 'vote_count.desc' },
];

let query = {} as any;
if (useRouter().currentRoute.value?.query?.discover?.length) {
    query = JSON.parse(decodeURIComponent(atob(useRouter().currentRoute.value?.query?.discover as string))) as any;
    if (query.with_keywords?.length) {
        selectedKeywords.value = query.with_keywords;
    }
    if (query.with_cast?.length) {
        selectedCast.value = query.with_cast;
    }
    if (query.with_crew?.length) {
        selectedCrew.value = query.with_crew;
    }
}
if (query.media_type === 'tv') {
    selectedType.value = 1;
}

const ratingOptions = new Array(10).fill({}).map((item, index) => ({
    value: index,
    text: `${index}+`,
})).reverse();

let pageTrack = 0;

const freshLoad = async () => {
    pageTrack = 0;
    canShowLoadMore.value = true;
    discoverResults.value = [];
    queryParams.value.media_type = selectedType.value === 0 ? 'movie' : 'tv';
    totalResults.value = (await loadData()).total_results as number;
}

const filteredDiscoveryResults = computed(() => {
    if (queryParams.value.hide_watched) {
        return discoverResults.value.filter(({ id }) => !userData.WatchedMovies.has(id));
    } else {
        return discoverResults.value;
    }
});

const queryParams = ref<any>({
    ...baseDiscoverQuery,
    ...query,
});

const loadData = async () => {
    const query = {
        ...queryParams.value,
        with_keywords: queryParams.value.with_keywords?.map((item: any) => item.id) || [],
        with_cast: queryParams.value.with_cast?.map((item: any) => item.id) || [],
        with_crew: queryParams.value.with_crew?.map((item: any) => item.id) || [],
    }
    const [page1, page2]: any = await Promise.all([
        $fetch('/api/discover', {
            method: 'POST',
            body: JSON.stringify({
                ...query,
                // include_adult: true,
                page: ++pageTrack,
            })
        }),
        $fetch('/api/discover', {
            method: 'POST',
            body: JSON.stringify({
                ...query,
                // include_adult: true,
                page: ++pageTrack
            })
        })
    ]);
    let results = [...(page1?.results || []), ...(page2?.results || [])]
    if (queryParams.value.hide_watched) {
        results = results.filter(({ id }) => !userData.WatchedMovies.has(id));
    }
    const data = {
        total_results: page1?.total_results,
        results
    } as {
        total_results: number;
        results: any[];
    };
    setTimeout(
        () => useRouter().replace({
            query: {
                ...useRoute().query,
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

const trottledLoadMore = _.throttle(loadMore, 1000);

const searchKeywords = async (search: string) => {
    if (!search || search.length < 3) {
        keywordSearchResults.value = [];
        return;
    }
    const results = await $fetch(`/api/keywords?query=${search}`);
    keywordSearchResults.value = results;
}

const searchPersons = async (search: string) => {
    if (!search || search.length < 3) {
        castSearchResults.value = [];
        crewSearchResults.value = [];
        return;
    }
    const results: any[] = await $fetch(`/api/person?query=${search}`);
    castSearchResults.value = results;
    crewSearchResults.value = results;
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

const handleScroll = () => {
  const windowHeight = window.innerHeight
  const documentHeight = document.documentElement.scrollHeight
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop

  isAtEnd.value = windowHeight + scrollTop >= documentHeight - 200 // 200px threshold
}

function onScroll() {
  handleScroll()
  if (isAtEnd.value && !pending.value) {
    trottledLoadMore()
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  handleScroll() // Check initial scroll position
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
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
.mainContent {
    ::-webkit-scrollbar {
        display: none;
    }
}
:deep(.sort-by-dropdown) {
    :deep(.v-field__input) {
        padding-top: 0 !important;
    }
    :deep(.v-field__append-inner) {
        padding-top: 5px !important;
    }
}
.v-checkbox {
    :deep(.v-label) {
        font-size: 13px;
    }
}
</style>
