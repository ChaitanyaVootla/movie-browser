<template>
    <div class="md:px-14">
        <Grid :items="watchedMovies || []" :title="`${watchedMovies?.length} movies`" :pending="pending" />
    </div>
</template>

<script setup lang="ts">
const { status } = useAuth();

const { pending, data: watchedMovies, refresh: refreshWatchedMovies } = await useLazyAsyncData('watchedFull', 
    () => {
        if (status.value === 'authenticated') {
            return $fetch('/api/user/movie/watchedFull').catch((err) => {
                console.log(err);
                return [];
            });
        }
        return Promise.resolve([]);
    },
    {
        default: () => [],
        server: false, // Keep client-side for user-specific content
        watch: [status], // Re-fetch when authentication status changes
    }
);

// Watch for authentication status changes and refresh data
watch(status, (newStatus, oldStatus) => {
    if (newStatus === 'authenticated' && oldStatus !== 'authenticated') {
        refreshWatchedMovies();
    }
});
useHead({
    ...DEFAULT_META,
    title: 'Watched Movies - The Movie Browser',
});
</script>
