<template>
    <NuxtLink :to="`/person/${item.id}/${getUrlSlug(item.name)}`">
        <div class="card group cursor-pointer pt-2 flex flex-col">
            <div class="relative">
                <SeoImg
                    :sources="profileSources"
                    aspect-ratio="16/9"
                    cover
                    :alt="`${item.name} as ${item.job || item.character}`"
                    class="image rounded-full hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-1 md:hover:-mt-1 border-2 border-transparent
                        hover:border-neutral-800 border-neutral-800 w-full h-full"
                    :timeout="4000">
                    <template #placeholder>
                        <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                    </template>
                    <template #error>
                        <div class="image bg-neutral-800 rounded-full"></div>
                    </template>
                </SeoImg>
            </div>
            <h3 class="title mt-1 text-xs line-clamp-2">
                {{ item.name }}
            </h3>
            <h3 v-if="item.job || item.character" class="text-neutral-400 text-xs line-clamp-2">
                {{  item.job || item.character }}
            </h3>
        </div>
    </NuxtLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getUrlSlug } from '~/utils/slug'

interface Props {
    item: any
    pending?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    pending: true
})

// Build progressive fallback sources array  
const profileSources = computed(() => {
    const sources: string[] = []
    
    if (!props.item?.profile_path) {
        return sources
    }
    
    // TMDB profile images (only source available for profiles)
    sources.push(`https://image.tmdb.org/t/p/w276_and_h350_face${props.item.profile_path}`)
    sources.push(`https://image.tmdb.org/t/p/w185${props.item.profile_path}`)
    
    return sources.filter(Boolean)
})
</script>

<style scoped lang="less">
@image-width: 6rem;
@image-height: calc(@image-width + 1rem);
@image-mobile-width: 5rem;
@image-mobile-height: calc(@image-mobile-width + 5px);

.card {
    flex: 0 0 auto;
    width: @image-width;
    .image {
        height: @image-height;
        width: @image-width;
        :deep(img) {
            object-position: top;
        }
    }
}
// reduce image-width for mobile
@media (max-width: 640px) {
    .card {
        width: @image-mobile-width;
        .image {
            height: @image-mobile-height;
            width: @image-mobile-width;
        }
    }
}
:deep(.v-skeleton-loader__image) {
    height: 100%;
}
</style>
