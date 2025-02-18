<template>
    <div class="md:mt-5 max-md:px-4">
        <div class="flex justify-between items-center w-full max-md:px-0 md:px-14">
            <div class="flex items-center gap-4">
                <div class="flex items-center max-md:gap-2 gap-4 w-fit rounded-xl border-2 border-neutral-600
                    my-6 pl-3 overflow-hidden max-md:text-sm">
                    <div class="font-medium">
                        {{ filteredCount }}
                    </div>
                    <div class="max-md:text-xs text-sm font-medium rounded-r-xl bg-neutral-800 w-fit h-full px-3
                        flex items-center py-1 text-neutral-3">
                        TOPICS
                    </div>
                </div>
                <div>
                    <NuxtLink to="/topics/all" class="underline underline-offset-2 max-md:text-sm text-primary">
                        View All Topics
                    </NuxtLink>
                </div>
            </div>
            <div class="max:md:w-1/3 md:w-1/4 min-w-44 mt-4">
                <v-text-field v-model="searchString" label="Search Topics" density="compact" variant="outlined" rounded
                    prependInnerIcon="mdi-magnify" clearable></v-text-field>
            </div>
        </div>
        <div :key="searchString">
            <ScrollProvider v-for="filter in filteredFilters" :scrollItem="filter" class="mb-16">
                <template v-slot:title>
                    <div class="text-sm md:text-xl font-medium flex justify-start items-center gap-3">
                        <h2 >{{ filter.name }}</h2>
                        <NuxtLink :to="`/topics/${filter.key}`"
                            class="text-xs md:text-sm text-primary underline underline-offset-2">
                            View All
                        </NuxtLink>
                        <!-- <NuxtLink :to="{ name: 'browse', query: getFilterQuery(filter) }"
                            class="text-xs md:text-sm text-primary underline underline-offset-2">
                            View All
                        </NuxtLink> -->
                    </div>
                </template>
            </ScrollProvider>
        </div>
    </div>
</template>

<script setup lang="ts">
import { topics, allTopics } from '~/utils/topics';
const TOPIC_LIMIT = 10;
const searchString = ref('');
// const { data: globalFilters }: any = useLazyAsyncData('globalFiltersTopics', async () => {
//     // @ts-ignore
//     return await $fetch('/api/filters');
// }, {
//     default: () => ([] as any[]),
//     transform: (filters: any) => {
//         return filters.map((filter: any) => {
//             const filterParams = {
//                 ...filter.filterParams,
//                 with_keywords: filter.filterParams.with_keywords?.map((item: any) => item.id) || [],
//                 with_cast: filter.filterParams.with_cast?.map((item: any) => item.id) || [],
//                 with_crew: filter.filterParams.with_crew?.map((item: any) => item.id) || [],
//             };
//             return {
//                 name: filter.name,
//                 filterParams,
//                 rawFilters: filter.filterParams
//             }
//         }).reverse();
//     }
// });

// const allTopics = Object.values(topics);
const filteredCount = computed(() => {
    return allTopics.filter((filter: any) => {
        return filter.name.toLowerCase().includes(searchString.value.toLowerCase());
    }).length;
});
const filteredFilters = computed(() => {
    if (!searchString.value?.length) return allTopics.slice(0, TOPIC_LIMIT);
    return allTopics.filter((filter: any) => {
        return filter.name.toLowerCase().includes(searchString.value.toLowerCase());
    }).slice(0, TOPIC_LIMIT);
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
