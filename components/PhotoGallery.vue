<template>
    <div class="px-14 font-semibold text-lg">
        <v-icon  icon="mdi-image-multiple-outline"></v-icon> Image Gallery
    </div>
    <v-carousel v-model="imageIndex" hide-delimiters :height="'calc(90vw * 0.3)'">
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
        <v-carousel-item v-for="image in images" class="full-image">
            <v-img :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.original}${image.file_path}`"
                    class="full-image" contain>
                    <template v-slot:placeholder>
                        <v-skeleton-loader class="full-image" type="image" />
                    </template>
                    <template v-slot:error>
                        <v-skeleton-loader class="full-image" type="image" >
                            <div></div>
                        </v-skeleton-loader>
                </template>
            </v-img>
        </v-carousel-item>
    </v-carousel>
    <Scroller :items="images" title="" :pending="pending">
        <template v-slot:default="{ item }">
            <GalleryImageCard :item="item" @click="openGallery(item.file_path)" />
        </template>
    </Scroller>
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
.full-image {
    width: 100%;
    height: 100%;
}
</style>
