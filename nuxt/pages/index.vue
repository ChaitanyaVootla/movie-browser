<template>
    <div class="ml-2 mr-2 mt-3 md:ml-10 md:mr-10 md:mt-10">
        <div>
            <div class="text-xl md:text-2xl md:mb-2 md:ml-14">
                Trending Movies
            </div>
            <v-slide-group>
                <v-slide-group-item v-for="movie in (trending?.movies || Array(10))">
                    <PosterCard :item="movie" :pending="pending" class="mr-6"/>
                </v-slide-group-item>
            </v-slide-group>
        </div>
        <div class="mt-5 md:mt-10">
            <div class="text-xl md:text-2xl md:mb-2 md:ml-14">
                Trending Series
            </div>
            <v-slide-group>
                <v-slide-group-item v-for="movie in (trending?.tv || Array(10))">
                    <PosterCard :item="movie" :pending="pending" class="mr-6"/>
                </v-slide-group-item>
            </v-slide-group>
        </div>
    </div>
</template>
<script setup lang="ts">
const { pending, data: trending }: any = await useLazyFetch('/api/trending', { key: 'trending' });
</script>

<style scoped lang="less">
</style>
