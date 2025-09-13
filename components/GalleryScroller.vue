<template>
    <Scroller :items="images" title="Image Gallery" :pending="pending"
        title-icon="mdi-image-multiple-outline">
        <template v-slot:default="{ item }">
            <GalleryImageCard :item="item" @click="openGallery(item.file_path)" />
        </template>
    </Scroller>

    <v-dialog
      v-model="dialog"
      transition="dialog-bottom-transition"
      fullscreen
    >
        <div>
            <v-btn icon @click="dialog = false" class="float-end">
                <v-icon>mdi-close</v-icon>
            </v-btn>
        </div>
        <v-carousel v-model="imageIndex" hide-delimiters>
            <v-carousel-item v-for="image in images">
                <div class="flex justify-center h-full w-full align-middle p-5">
                    <SeoImg 
                        :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.original}${image.file_path}`"
                        :alt="`Gallery image ${image.file_path ? image.file_path.split('/').pop() : 'from collection'}`">
                            <template #placeholder>
                                <v-skeleton-loader class="w-full h-full" type="image">
                                    <div></div>
                                </v-skeleton-loader>
                            </template>
                            <template #error>
                                <v-skeleton-loader class="w-full h-full" type="image" >
                                    <div></div>
                                </v-skeleton-loader>
                        </template>
                    </SeoImg>
                </div>
            </v-carousel-item>
        </v-carousel>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps({
    images: {
        type: Array,
        required: true,
        default: []
    },
    pending: {
        type: Boolean,
        required: true,
        default: true
    },
});

let dialog = ref(false);
let imageIndex = ref(0);

const openGallery = (file_path: any) => {
    imageIndex.value = props.images.findIndex((i: any) => i.file_path === file_path);
    dialog.value = true;
};
</script>

<style scoped lang="less">
:deep(.v-carousel) {
    height: 100% !important;
    position: static;
}
</style>