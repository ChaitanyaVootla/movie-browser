<template>
  <div ref="lazyLoader">
    <slot v-if="isViewIntersecting"></slot>
    <v-skeleton-loader v-else type="image" :class="`max-md:w-[${mobileWidth}] max-md:h-[${mobileHeight}]
        md:w-[${width}] md:h-[${height}]`"></v-skeleton-loader>
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

defineProps({
  height: {
    type: String,
    required: true,
  },
  width: {
    type: String,
    required: true,
  },
  mobileHeight: {
    type: String,
    required: true,
  },
  mobileWidth: {
    type: String,
    required: true,
  },
});

const isViewIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);

const { stop } = useIntersectionObserver(
    lazyLoader,
    ([{ isIntersecting }]) => {
        if (isIntersecting) {
            // setTimeout(() => {
            //     isViewIntersecting.value = true;
            // }, 2000);
            isViewIntersecting.value = true;
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
