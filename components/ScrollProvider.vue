<template>
    <Scroller ref="lazyLoader" :items="filteredScrollItems" :title="localScrollItem.name" :pending="pending">
        <template v-slot:title>
            <div class="flex items-center justify-between md:pr-14">
                <slot name="title">
                    <div v-if="!scrollItem.isPromo">
                        <NuxtImg v-if="localScrollItem.logo" :src="localScrollItem.logo" :alt="localScrollItem.name"
                            class="object-cover -m-0" height="20" width="100" :class="localScrollItem.name" />
                        <h2 v-else class="text-sm md:text-xl font-medium">{{ localScrollItem.name }}</h2>
                    </div>
                </slot>
                <!-- <v-btn-toggle v-if="!hideQuickFilter" v-model="sortOrder" density="compact" @update:model-value="changeSort" mandatory
                    :style="$vuetify.display.mobile?'height: 20px':'height: 25px'" class="ml-5" variant="outlined">
                    <v-btn size="small">Popular</v-btn>
                    <v-btn size="small">New</v-btn>
                </v-btn-toggle> -->
                <v-checkbox
                    v-if="!scrollItem.isPromo"
                    v-model="hide_watched"
                    color="white"
                    label="Hide Watched"
                    density="compact"
                    hide-details
                    class="watched-checkbox !h-8 !text-2xs"
                    @update:model-value="updateHideWatched"
                ></v-checkbox>
            </div>
        </template>
        <template v-slot:default="{ item }">
            <slot :item="item"></slot>
        </template>
    </Scroller>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';
import { userStore } from '~/plugins/state';

const sortOrder = ref(0);
const lazyLoader = ref<HTMLElement | null>(null);
const { scrollItem } = defineProps<{
    scrollItem: any,
    hideQuickFilter?: boolean
}>()
// Create a local reactive copy of scrollItem
const localScrollItem = ref({ ...scrollItem })
const userData = userStore();
const scrollItems = ref<any[]>([]);
const canLoadMore = ref(true);
const ITEMS_REQUIRED = 15;
const hide_watched = ref(false);
let page = 1;

hide_watched.value = localScrollItem.value.filterParams.hide_watched;

if (localScrollItem.value.filterParams.hide_details === null) {
    localScrollItem.value.filterParams.hide_details = false;
}

const { pending, refresh }: any = useLazyAsyncData(`scrollDiscover-${localScrollItem.value.name}`, async () => {
    return await $fetch('/api/discover', {
        method: 'POST',
        body: {
            ...localScrollItem.value.filterParams,
            page: page++
        },
        params: {
            getFullData: localScrollItem.value.isPromo
        },
        retry: 5,
    })
}, {
    transform: (discoverData: any) => {
        let results = discoverData.results;
        if (results.length < 20) {
            canLoadMore.value = false;
        }
        if (localScrollItem.value.transform) {
            results =  localScrollItem.value.transform(results);
        }
        scrollItems.value.push(...results);
    },
    immediate: false,
});

const filteredScrollItems = computed(() => {
    if (localScrollItem.value.filterParams.hide_watched) {
        return scrollItems.value.filter((item) => {
            return !userData.WatchedMovies.has(item.id);
        });
    }
    return scrollItems.value;
}) as ComputedRef<any[]>

const updateHideWatched = (value: any) => {
    localScrollItem.value.filterParams.hide_watched = value;
}

watch(filteredScrollItems, (items) => {
    if (canLoadMore.value && items.length < ITEMS_REQUIRED) {
        refresh();
    }
});

const changeSort = () => {
    scrollItems.value = [];
    page = 1;
    localScrollItem.value.filterParams.sort_by = sortOrder.value === 0 ? 'popularity.desc' : 'release_date.desc';
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
:deep(.watched-checkbox) {
    .v-label {
        font-size: 12px;
    }
    
    @media (min-width: 768px) {
        .v-label {
            font-size: 14px;
        }
    }
}
</style>
