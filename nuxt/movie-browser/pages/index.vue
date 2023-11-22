<template>
    <Scroller :items="trendingMovieRes.results" title="Trending Movies" class="mt-10 ml-20 mr-20"/>
    <Scroller :items="trendingTVRes.results" title="Trending Series" class="mt-10 ml-20 mr-20"/>
</template>

<script setup lang="ts">
    const { data: trendingMovieRes }: {data: any } = await useAsyncData("movies",
        () => $fetch("https://api.themoviedb.org/3/trending/movie/day?api_key=1f54bd990f1cdfb230adb312546d765d&language=en-US&page=1"));
    const { data: trendingTVRes }: {data: any } = await useAsyncData("tv",
        () => $fetch("https://api.themoviedb.org/3/trending/tv/day?api_key=1f54bd990f1cdfb230adb312546d765d&language=en-US&page=1"));
</script>
