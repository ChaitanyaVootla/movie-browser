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
        <v-carousel v-model="imageIndex">
            <v-carousel-item v-for="image in images">
                <div class="flex justify-center h-full w-full align-middle p-5">
                    <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.original}${image.file_path}`"
                            contain>
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