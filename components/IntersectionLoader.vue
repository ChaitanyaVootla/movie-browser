<template>
    <div ref="lazyLoader" class="miun-h-[100px] md:min-h-[200px]">
        <slot v-if="isIntersecting && isClient"></slot>
    </div>
</template>

<script setup lang="ts">
const isIntersecting = ref(false);
const lazyLoader = ref<HTMLElement | null>(null);
const isClient = ref(false);

onMounted(() => {
    if (process.client === false) return;
    if (typeof window === 'undefined') return;
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
