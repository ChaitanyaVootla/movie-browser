<template>
    <div class="wide-image mt-3">
        <SeoImg :sources="imageSources"
            class="rounded-lg mr-2 wide-image border-2 border-neutral-800 cursor-pointer"
            cover
            :alt="`Gallery image ${item.file_path ? 'from ' + item.file_path.split('/').pop() : ''}`">
            <template #placeholder>
                <v-skeleton-loader class="wide-image" type="image" />
            </template>
            <template #error>
                <v-skeleton-loader class="wide-image" type="image" >
                    <div></div>
                </v-skeleton-loader>
            </template>
        </SeoImg>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { configuration } from '~/utils/constants'

interface Props {
    item: any
}

const props = defineProps<Props>()

const imageSources = computed(() => {
    const sources: string[] = []
    
    if (props.item?.file_path) {
        // TMDB backdrop images at different resolutions
        sources.push(`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${props.item.file_path}`)
        sources.push(`https://image.tmdb.org/t/p/w500${props.item.file_path}`)
    }
    
    return sources.filter(Boolean)
})
</script>

<style scoped lang="less">
@wide-image-height: 15rem;
:deep(.wide-image) {
    height: @wide-image-height;
    width: calc(@wide-image-height * 16/9);
}
:deep(.wide-card) {
    width: calc(@wide-image-height * 16/9);
}
@media (max-width: 768px) {
    @wide-image-height: 7rem;
    :deep(.wide-image) {
        height: @wide-image-height;
        width: calc(@wide-image-height * 16/9);
    }
    :deep(.wide-card) {
        width: calc(@wide-image-height * 16/9);
    }
}
</style>