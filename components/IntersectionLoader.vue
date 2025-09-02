<template>
  <div ref="lazyLoader">
    <!-- Show content during SSR for SEO, then lazy load on client -->
    <slot v-if="shouldShowContent"></slot>
    <v-skeleton-loader v-else type="image" :class="`max-md:w-[${mobileWidth}] max-md:h-[${mobileHeight}]
        md:w-[${width}] md:h-[${height}]`" color="black"></v-skeleton-loader>
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
const isMounted = ref(false);

// Show content immediately during SSR, then use intersection observer on client
const shouldShowContent = computed(() => {
    // During SSR, always show content for SEO
    if (!process.client) return true;
    
    // On client, show content after mounting for first visible items
    // or when intersection observer triggers
    return isMounted.value || isViewIntersecting.value;
});

onMounted(() => {
    isMounted.value = true;
    
    // Start intersection observer for lazy loading of off-screen content
    setTimeout(() => {
        const { stop } = useIntersectionObserver(
            lazyLoader,
            ([{ isIntersecting }]) => {
                if (isIntersecting) {
                    isViewIntersecting.value = true;
                    stop();
                }
            },
            {
                rootMargin: '300px', // Reduced from 500px for better performance
                threshold: 0,
            }
        );
        
        onUnmounted(() => {
            stop();
        });
    }, 100); // Small delay to prevent flash during hydration
});
</script>
