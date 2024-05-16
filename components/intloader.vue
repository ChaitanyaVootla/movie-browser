<template>
<div ref="lazyLoader" class="lazy-loader">
    <ClientOnly>
        <slot v-if="isIntersecting && isClient"></slot>
    </ClientOnly>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);
const isClient = ref(false);

onMounted(() => {
    isClient.value = true;
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) {
                isIntersecting.value = true;
                observer.disconnect();
            }
        },
        {
            rootMargin: '0px',
            threshold: 0.1
        }
    );

    if (lazyLoader.value) {
        observer.observe(lazyLoader.value);
    }
});
</script>

<style scoped>
.lazy-loader {
    min-height: 200px; /* Adjust as needed to prevent layout shift */
}
</style>