<template v-if="false">
    <div ref="lazyLoader" class="lazy-loader">
        <slot v-if="isIntersecting"></slot>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);

onMounted(() => {
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