<template>
    <NuxtLink :to="'https://www.youtube.com/watch?v=' + item.key" target="blank" noreferrer noopener>
        <div class="flex flex-col gap-2 mt-2 cursor-pointer wide-card" >
            <div class="text-neutral-400 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                text-xs md:text-sm -mb-1">
                <div class="flex gap-2">
                    {{ item.type }}
                </div>
            </div>
            <SeoImg :src="`https://img.youtube.com/vi/${item.key}/maxresdefault.jpg`"
                class="rounded-lg mr-2 wide-image"
                cover
                :alt="item.name">
                <template #placeholder>
                    <v-skeleton-loader class="wide-image" type="image" />
                </template>
                <template #error>
                    <v-skeleton-loader class="wide-image" type="image" >
                        <div></div>
                    </v-skeleton-loader>
                </template>
            </SeoImg>
            <div class="text-neutral-200 overflow-ellipsis whitespace-nowrap overflow-hidden pr-4
                text-xs md:text-base">
                {{ item.name }}
            </div>
        </div>
    </NuxtLink>
</template>

<script setup lang="ts">
defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
});
</script>

<style scoped lang="less">
@wide-image-height: 18rem;
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