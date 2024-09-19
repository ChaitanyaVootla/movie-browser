<template>
    <div class="mt-2 md:mt-5 max-md:px-4">
        <div class="flex justify-between items-center w-full max-md:px-3 md:px-14">
            <div>
                {{ globalFilters.length }} Topics
            </div>
            <div class="w-52">
                <v-text-field v-model="searchString" label="Search" density="compact" variant="outlined"
                    prependInnerIcon="mdi-magnify" clearable></v-text-field>
            </div>
        </div>
        <div :key="searchString">
            <ScrollProvider v-for="filter in filteredFilters" :scrollItem="filter">
                <template v-slot:title>
                    <div class="text-sm md:text-xl font-medium flex justify-start items-center gap-3">
                        <h2 >{{ filter.name }}</h2>
                        <NuxtLink :to="{ name: 'browse', query: getFilterQuery(filter) }"
                            class="text-xs md:text-sm text-primary underline underline-offset-2">
                            View All
                        </NuxtLink>
                    </div>
                </template>
            </ScrollProvider>
        </div>
    </div>
</template>

<script setup lang="ts">
const searchString = ref('');
const { data: globalFilters }: any = useLazyAsyncData('globalFiltersTopics', async () => {
    return await $fetch('/api/filters');
}, {
    default: () => ([] as any[]),
    transform: (filters: any) => {
        return filters.map((filter: any) => {
            const filterParams = {
                ...filter.filterParams,
                with_keywords: filter.filterParams.with_keywords?.map((item: any) => item.id) || [],
                with_cast: filter.filterParams.with_cast?.map((item: any) => item.id) || [],
                with_crew: filter.filterParams.with_crew?.map((item: any) => item.id) || [],
            };
            return {
                name: filter.name,
                filterParams,
                rawFilters: filter.filterParams
            }
        }).reverse();
    }
});

const filteredFilters = computed(() => {
    if (!searchString.value?.length) return globalFilters.value;
    return globalFilters.value.filter((filter: any) => {
        return filter.name.toLowerCase().includes(searchString.value.toLowerCase());
    });
});

const getFilterQuery = (filter: any) => {
    return {
        discover: btoa(encodeURIComponent(JSON.stringify(filter.rawFilters)))
    }
}

useHead({
    title: 'Topics - The Movie Browser',
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
