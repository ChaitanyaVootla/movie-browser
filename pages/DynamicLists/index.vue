<template>
    <div class="md:mt-5"></div>
    <ScrollProvider v-for="filter in globalFilters" :scrollItem="filter">
    </ScrollProvider>
</template>

<script setup lang="ts">
const { data: globalFilters, refresh: refreshGlobalFilters }: any = useLazyAsyncData('globalFilters', async () => {
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
            }
        });
    }
});
</script>
