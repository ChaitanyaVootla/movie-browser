<template>
    <div>
        <div class="flex justify-between items-center max-md:pt-1 md:py-2 md:mr-4">
            <div class="flex items-center">
                <slot :item="title">
                    <div v-if="title?.length" class="title text-lg mr-5">
                        {{ title }}
                    </div>
                </slot>
                <v-btn-toggle v-model="viewType" mandatory density="compact" @update:model-value="viewTypeUpdated"
                    class="!h-5 md:!h-6">
                    <v-btn icon="mdi-view-comfy" class="px-5" :size="$vuetify.display.mdAndDown?'x-small':'small'" />
                    <v-btn icon="mdi-view-headline" class="px-5" :size="$vuetify.display.mdAndDown?'x-small':'small'" />
                </v-btn-toggle>
            </div>
            <div>
                <slot name="sortaction" :item="title"></slot>
            </div>
        </div>
        <div class="pb-3" :class="{list: viewType, grid: !viewType || $vuetify.display.mdAndUp}">
            <div v-for="item in pending?new Array(30).fill({}):items" :key="item?.id">
                <WideCardDetailed v-if="viewType" :item="item" />
                <PosterCard v-else :item="item" :addToFilter="addToFilter" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps({
    items: {
        type: Object,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    pending: {
        type: Boolean,
    },
    addToFilter: {
        type: Function,
    }
});

const list = useRoute().query.list as string;
const viewType = ref(list?parseInt(list):0);

const viewTypeUpdated = (val: number) => {
    useRouter().replace({ query: {
        ...useRoute().query,
        list: val
    }});
};
</script>

<style scoped lang="less">
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
    &.list {
        grid-template-columns: repeat(auto-fit, minmax(25rem, 1fr));
    }
}
@media screen and (max-width: 768px) {
    @image-mobile-width: 8rem;
    .grid {
        grid-template-columns: repeat(auto-fit, minmax(@image-mobile-width, @image-mobile-width));
        gap: 0.5rem;
        justify-content: space-evenly;
        padding: 0.25rem;
    }
    :deep(.card) {
        width: @image-mobile-width;
        height: calc(@image-mobile-width * (3/2));
        .image {
            height: calc(@image-mobile-width * (3/2));
            width: @image-mobile-width;
        }
    }
}

:deep(.v-skeleton-loader__image) {
    height: 100%;
}
</style>
