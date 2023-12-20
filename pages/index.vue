<template>
    <div>
        <Scroller :items="trending?.movies" :pending="pending" title="Trending Movies" class="mt-8" />
        <Scroller :items="trending?.tv" :pending="pending" title="Trending Series" class="mt-12" />
    </div>
</template>
<script setup lang="ts">
useHead({
    title: 'The Movie Browser',
});
const { pending, data: trending }: any = await useLazyFetch('/api/trending',
    {
        key: 'trending',
        default: () => ({
            movies: [],
            tv: []
        })
    }
);
</script>

<style scoped lang="less">
</style>
