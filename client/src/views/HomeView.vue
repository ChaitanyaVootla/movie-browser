<script setup lang="ts">
import { api } from '@/api';
import { ref, onMounted } from 'vue';
import imageScrollerVue from '@/components/image-scroller.vue';
import navBarVue from '@/components/nav-bar.vue';
import carouselView from '@/components/carousel-view.vue';

defineProps({
    toggleTheme: {
        type: Function,
        required: true,
    },
});
const trending = ref([] as any[]);

const getTrending = async () => {
    trending.value = (await api.getTrendingListWeek()).results;
};

onMounted(() => {
    getTrending();
});
</script>

<template>
    <navBarVue :toggle-theme="toggleTheme" />
    <div class="pt-16 dark:bg-neutral-900 h-screen dark:text-white">
        <carouselView :trending="trending" class="mb-5"/>
        <imageScrollerVue :items="trending" heading="Trending this week"/>
    </div>
</template>
