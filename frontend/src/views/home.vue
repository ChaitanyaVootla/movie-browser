<template>
    <div class="main-container">
        <div class="">
            <carousel :items="trending"/>
        </div>
        <div class="q-pt-lg">
            <slider :items="trending" heading="Trending"/>
        </div>
    </div>
</template>

<script lang="ts">
import slider from '@/components/slider.vue'
import carousel from '@/components/carousel.vue'
import api from '@/api';
export default {
    data() {
        return {
            tab: '',
            trending: [] as any[],
            slide: 1,
        }
    },
    components: {
        slider,
        carousel,
    },
    created() {
        this.init();
    },
    methods: {
        async init() {
            this.trending = await api.getTrendingAll();
        }
    }
}
</script>

<style scoped lang="scss">
@import "@/css/quasar.variables.sass";
.main-container {
    padding: 0 2rem;
    padding-top: 10px;
    @media (max-width:810px) {
        padding: 0 5px;
    }
}
</style>