<template>
<span class="md:h-[30rem] md:w-[36rem] hidden"></span>
<span class="max-md:h-[calc((80vw*0.5625)+12rem)] max-md:w-[80vw] hidden"></span>
<IntersectionLoader height="30rem" width="36rem" mobileHeight="calc((80vw * 0.5625) + 12rem)" mobileWidth="80vw" :eager="true">
    <NuxtLink :to="`/${item.title ? 'movie': 'series'}/${item.id}/${getUrlSlug(item.title || item.name)}`">
        <div class="promo-img">
            <SeoImg :sources="[imagePath, `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${props.item.backdrop_path}`].filter(Boolean)"
                :alt="item.title || item.name" 
                class="h-full object-cover rounded-lg"
                cover>
                <template #placeholder>
                    <v-skeleton-loader type="image" class="h-full w-full" />
                </template>
                <template #error>
                    <div class="promo-img bg-neutral-800 rounded-lg"></div>
                </template>
            </SeoImg>
        </div>
        <div class="h-32 p-4">
            <div v-if="logo" class="title-logo logo-shadow w-full h-full flex justify-center items-center">
                <SeoImg :sources="[logoPath, `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${logo}`].filter(Boolean)"
                    :alt="item.title || item.name" 
                    class="logo-img object-contain">
                    <template #placeholder>
                        <v-skeleton-loader type="image" class="w-24 h-16" />
                    </template>
                    <template #error>
                        <div class="w-full h-full flex items-center justify-center text-xl font-medium">
                            {{ item.title || item.name }}
                        </div>
                    </template>
                </SeoImg>
            </div>
            <div v-else class="w-full h-full flex items-center justify-center text-xl font-medium">
                {{ item.title || item.name }}
            </div>
        </div>
        <div class="flex justify-center">
            <Ratings :ratings="item.ratings" :small="true" :minimal="true" />
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

// Error handling is now managed by SeoImg component
</script>

<style scoped lang="less">
@image-height: 20rem;
.promo-img {
    height: @image-height;
    width: calc(@image-height * 16 / 9);
}
.title-logo {
    :deep(.logo-img) {
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
        width: 100%;
    }
    .logo-shadow {
        filter: drop-shadow(0 0 0.4px #eee);
    }
}
</style>