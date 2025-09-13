<template>
<span class="md:h-[30rem] md:w-[36rem] hidden"></span>
<span class="max-md:h-[20rem] max-md:w-[30rem] hidden"></span>
<IntersectionLoader height="30rem" width="36rem" mobileHeight="20rem" mobileWidth="30rem" :eager="true">
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}/${getUrlSlug(item.title || item.name)}`">
        <div class="promo-img">
            <NuxtImg :src="imagePath" @error="onError"
                :alt="item.title || item.name" class="h-full object-cover rounded-lg">
            </NuxtImg>
        </div>
        <div class="h-32 p-4">
            <div v-if="logo" class="title-logo logo-shadow w-full h-full flex justify-center items-center">
                <NuxtImg :src="logoPath" @error="onLogoError"
                    :alt="item.title || item.name" class="object-contain" />
            </div>
            <div v-else class="h-full w-full text-center mt-4 text-xl font-medium">
                {{ item.title || item.name }}
            </div>
        </div>
        <div class="flex justify-center">
            <Ratings :googleData="item.googleData" :tmdbRating="item.vote_average" :itemId="item.id" :title="item.title"
                :voteCount="item.vote_count" :small="true" :minimal="true" />
        </div>
    </NuxtLink>
</IntersectionLoader>
</template>

<script setup lang="ts">
import { configuration } from '~/utils/constants'

const props = defineProps({
    item: {
        type: Object,
        required: true,
        default: () => ({})
    },
});

const logo = computed(() => {
    return props.item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path;
});
const imagePath = ref('');
const logoPath = ref('');

watch(
    () => props.item, // Watch the `item` prop for changes
    (newItem) => {
        imagePath.value = getCdnImage(props.item, IMAGE_TYPE.BACKDROP)
        logoPath.value = getCdnImage(props.item, IMAGE_TYPE.LOGO)
    },
    { immediate: true, deep: true } // Immediate to run the watcher on mount, deep for nested changes
);

const onLogoError = () => {
    logoPath.value = `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${props.item.images?.logos?.find(({ iso_639_1 }: any) => iso_639_1 === 'en')?.file_path}`;
};
const onError = () => {
    imagePath.value = `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${props.item.backdrop_path}`;
};
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
    .promo-img {
        height: auto;
        width: 80vw;
    }
    .logo-shadow {
        filter: drop-shadow(0 0 0.4px #eee);
    }
}
</style>