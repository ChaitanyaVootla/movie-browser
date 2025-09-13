<template>
        <Scroller ref="scrollerRef" :items="filteredScrollItems" :title="localScrollItem.name" :pending="pending">
        <template v-slot:title>
            <div class="flex items-center justify-between md:pr-14">
                <slot name="title">
                    <div v-if="!props.scrollItem.isPromo">
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
                    v-if="!props.scrollItem.isPromo"
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
import { useIntersectionObserver, useDebounceFn } from '@vueuse/core';
import { userStore } from '~/plugins/state';

const props = defineProps<{
    scrollItem: any,
    hideQuickFilter?: boolean
}>();

const sortOrder = ref(0);
const scrollerRef = ref<HTMLElement | null>(null);
// Create a local reactive copy of scrollItem
const localScrollItem = ref({ ...props.scrollItem })
const userData = userStore();
const scrollItems = ref<any[]>([]);
const canLoadMore = ref(true);
const hide_watched = ref(false);

// Constants
const ITEMS_REQUIRED = 15;
let page = 1;

hide_watched.value = localScrollItem.value.filterParams.hide_watched;

if (localScrollItem.value.filterParams.hide_details === null) {
    localScrollItem.value.filterParams.hide_details = false;
}

// Data fetching with better error handling and timeout
const { pending, refresh }: any = useLazyAsyncData(
  `scrollDiscover-${localScrollItem.value.name}`, 
  async () => {
    try {
      return await $fetch('/api/discover', {
        method: 'POST',
        body: {
          ...localScrollItem.value.filterParams,
          page: page++
        },
        params: {
          getFullData: localScrollItem.value.isPromo
        },
        retry: 3, // Reduced from 5 for faster failure
        timeout: 10000, // 10s timeout
      });
    } catch (error) {
      console.error(`Failed to fetch data for ${localScrollItem.value.name}:`, error);
      canLoadMore.value = false;
      throw error;
    }
  }, 
  {
    transform: (discoverData: any) => {
      const results = discoverData?.results || [];
      
      if (results.length < 20) {
        canLoadMore.value = false;
      }
      
      const transformedResults = localScrollItem.value.transform 
        ? localScrollItem.value.transform(results)
        : results;
        
      scrollItems.value.push(...transformedResults);
      return transformedResults;
    },
    immediate: false,
  }
);

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

// Watch filtered items for auto-loading with better control
watch(filteredScrollItems, (items) => {
  if (canLoadMore.value && items.length < ITEMS_REQUIRED && !pending.value) {
    // Use nextTick to avoid immediate recursive calls
    nextTick(() => {
      if (canLoadMore.value && items.length < ITEMS_REQUIRED) {
        refresh();
      }
    });
  }
}, { flush: 'post' }); // Execute after DOM updates

const resetAndRefresh = () => {
  scrollItems.value = [];
  canLoadMore.value = true;
  page = 1;
  refresh();
};

const changeSort = () => {
    localScrollItem.value.filterParams.sort_by = sortOrder.value === 0 ? 'popularity.desc' : 'release_date.desc';
    resetAndRefresh();
}

// Debounced intersection handler to prevent multiple rapid API calls
const debouncedIntersectionHandler = useDebounceFn(([{ isIntersecting }]) => {
  if (isIntersecting && canLoadMore.value && !pending.value) {
    refresh().finally(() => {
      // Only stop observing if we can't load more
      if (!canLoadMore.value) {
        stop();
      }
    });
  }
}, 100); // 100ms debounce to prevent rapid requests

// Setup intersection observer with optimized settings
const { stop } = useIntersectionObserver(
  scrollerRef,
  debouncedIntersectionHandler,
  {
    rootMargin: '200px', // Reduced from 500px for better performance
    threshold: 0.1, // More precise triggering
  }
);

// Cleanup
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
