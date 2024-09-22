<template>
    <div class="md:px-14">
        <Grid :items="watchedMovies || []" :title="`${watchedMovies?.length} movies`" :pending="pending" />
    </div>
</template>

<script setup lang="ts">
const headers = useRequestHeaders(['cookie']) as HeadersInit

const { pending, data: watchedMovies } = await useLazyAsyncData('watchedFull', () => $fetch('/api/user/movie/watchedFull', { headers }));
useHead({
    ...DEFAULT_META,
    title: 'Watched Movies - The Movie Browser',
});
</script>
