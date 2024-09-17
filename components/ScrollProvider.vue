<template>
    <Scroller ref="lazyLoader" :items="scrollItems" :title="scrollItem.name" :pending="pending">
        <template v-slot:title>
            <div class="flex items-center max-md:justify-between">
                <NuxtImg v-if="scrollItem.logo" :src="scrollItem.logo" :alt="scrollItem.name" class="h-10 object-cover -m-0" :class="scrollItem.name" />
                <h2 v-else class="text-sm md:text-xl font-medium">{{scrollItem.name}}</h2>
                <v-btn-toggle v-if="!hideQuickFilter" v-model="sortOrder" density="compact" @update:model-value="changeSort" mandatory
                    :style="$vuetify.display.mobile?'height: 20px':'height: 25px'" class="ml-5" variant="outlined">
                    <v-btn size="small">Popular</v-btn>
                    <v-btn size="small">New</v-btn>
                </v-btn-toggle>
            </div>
        </template>
        <template v-slot:default="{ item }">
            <slot :item="item"></slot>
        </template>
    </Scroller>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

const sortOrder = ref(0);
const lazyLoader = ref<HTMLElement | null>(null);
const { scrollItem } = defineProps<{
    scrollItem: any,
    hideQuickFilter?: boolean
}>()
const { data: scrollItems, pending, refresh }: any = useLazyAsyncData(`scrollDiscover-${scrollItem.name}`, async () => {
    return await $fetch('/api/discover', {
        method: 'POST',
        body: scrollItem.filterParams,
        params: {
            getFullData: scrollItem.isPromo
        },
        retry: 5,
    })
}, {
    transform: (discoverData: any) => {
        const results = discoverData.results;
        if (scrollItem.transform) {
            return scrollItem.transform(results);
        }
        return results;
    },
    immediate: false,
    server: false
});

const changeSort = () => {
    scrollItem.filterParams.sort_by = sortOrder.value === 0 ? 'popularity.desc' : 'release_date.desc';
    refresh();
}

const { stop } = useIntersectionObserver(
    lazyLoader,
    ([{ isIntersecting }]) => {
        if (isIntersecting) {
            refresh();
            stop();
        }
    },
    {
        rootMargin: '500px',
        threshold: 0,
    }
);

onUnmounted(() => {
    stop();
});
</script>

<style scoped lang="less">
.netflix, .prime {
    margin: -5px;
}
.hotstar {
    padding: 3px;
    margin: -3px;
}
.apple, .aha {
    margin: -8px;
    padding: 10px;
}
</style>
