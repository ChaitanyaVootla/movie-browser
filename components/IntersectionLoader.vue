<template>
  <div ref="lazyLoader" class="min-h-[200px]">
    <slot v-if="isViewIntersecting"></slot>
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

const isViewIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);

const { stop } = useIntersectionObserver(
    lazyLoader,
    ([{ isIntersecting }]) => {
        if (isIntersecting) {
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
