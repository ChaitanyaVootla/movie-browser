<template>
    <div class="wide-image mt-3">
        <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${item.file_path}`"
            class="rounded-lg mr-2 wide-image border-2 border-neutral-800"
            cover
            :alt="item.name">
            <template v-slot:placeholder>
                <v-skeleton-loader class="wide-image" type="image" />
            </template>
            <template v-slot:error>
                <v-skeleton-loader class="wide-image" type="image" >
                    <div></div>
                </v-skeleton-loader>
            </template>
        </v-img>
    </div>
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