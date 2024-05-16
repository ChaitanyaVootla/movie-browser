<template>
    <div ref="lazyLoader" class="lazy-loader">
        <slot v-if="isIntersecting && isClient"></slot>
    </div>
</template>

<script setup lang="ts">
const isIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);
const isClient = ref(false);

onMounted(() => {
    if (process.client === false) return;
    isClient.value = true;
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) {
                console.log(`item visible ${entry.target}`)
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