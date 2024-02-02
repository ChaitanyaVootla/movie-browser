<template>
    <div class="w-full flex justify-center">
        <div class="px-10 py-5 bg-neutral-800 rounded-lg max-md:w-full md:w-50">
            <div>
                <div class="text-sm md:text-xl font-bold text-neutral-100">{{ episode.name }}</div>
                <div class="text-xs md:text-base text-neutral-300">{{ episode.overview }}</div>
            </div>
            <v-carousel color="white" :cycle="true" :interval="10000" hideDelimiterBackground
                delimiterIcon="mdi-circle-medium" class="carousel mt-5">
                <template v-slot:prev="{ props }">
                    <div class="w-12 h-full cursor-pointer flex justify-center items-center group" @click="props.onClick">
                        <v-icon icon="mdi-chevron-left" class="group-hover:scale-150"></v-icon>
                    </div>
                </template>
                <template v-slot:next="{ props }">
                    <div class="w-12 h-full cursor-pointer flex justify-center items-center group" @click="props.onClick">
                        <v-icon icon="mdi-chevron-right" class="group-hover:scale-150"></v-icon>
                    </div>
                </template>
                <v-carousel-item height="calc(100vw + 20rem)" v-for="item in (fullEpisode?.images?.stills || [episode])">
                    <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${item.still_path || item.file_path}`"
                        class="w-full h-auto rounded-lg" />
                </v-carousel-item>
            </v-carousel>
        </div>
    </div>
</template>

<script setup lang="ts">
const { episode } = defineProps({
    episode: {
        type: Object,
        required: true,
    },
});

const fullEpisode = await $fetch(`/api/series/${episode.show_id}/season/${episode.season_number}/episode/${episode.episode_number}`);
</script>

<style scoped lang="less">
:deep(.v-carousel) {
    height: calc(100vw/2 * 1/1.77) !important;
}
</style>