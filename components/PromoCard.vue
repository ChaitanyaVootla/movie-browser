<template>
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}`">
        <div class="promo-img">
            <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${item.backdrop_path}`"
                :alt="item.title || item.name" class="h-full object-cover rounded-lg">
            </NuxtImg>
        </div>
        <div class="h-32 p-4">
            <div v-if="logo" class="title-logo logo-shadow w-full h-full flex justify-center items-center">
                <NuxtImg :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${logo}`"
                    :alt="item.title || item.name" class="object-contain" />
            </div>
            <div v-else class="h-full w-full">
                {{ item.title || item.name }}
            </div>
        </div>
        <div class="flex justify-center">
            <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id" :title="item.title"
                :voteCount="item.vote_count" :small="true" :minimal="true" />
        </div>
    </NuxtLink>
</template>

<script setup lang="ts">
const props = defineProps<{
    item: any;
}>();

const logo = computed(() => {
    return props.item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path;
});
</script>

<style scoped lang="less">
@image-height: 20rem;
.promo-img {
    height: @image-height;
    width: calc(@image-height * 16 / 9);
}
.title-logo {
    img {
        min-height: 50%;
        max-height: 100%;
        max-width: 60%;
    }
}
.logo-shadow {
    filter: drop-shadow(0 0 1px #777);
}
@media (max-width: 768px) {
    .logo-shadow {
        filter: drop-shadow(0 0 0.4px #eee);
    }
}
</style>