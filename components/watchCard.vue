<template>
    <div ref="cardContainer" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
        <div class="w-44 md:w-80 group cursor-pointer pt-2 flex flex-col">
            <NuxtLink :to="item.watchLink" target="blank" noreferrer noopener>
                <SeoImg
                    :src="imagePath"
                    :alt="`${item.title || item.name} poster`"
                    cover
                    class="image rounded-lg hover:rounded-md hover:shadow-md hover:shadow-neutral-800
                        hover:transition-all duration-300 hover:mb-1 md:hover:-mt-1 w-full h-auto"
                    :aspect-ratio="1.77"
                    @error="imageError">
                    <template #placeholder>
                        <v-skeleton-loader type="image" class="image w-full h-full"></v-skeleton-loader>
                    </template>
                    <template #error>
                        <v-skeleton-loader type="image" class="image w-full h-full">
                            <div></div>
                        </v-skeleton-loader>
                    </template>
                </SeoImg>
            </NuxtLink>
            <NuxtLink :to="`/${item.title?'movie':'series'}/${item.id}/${getUrlSlug(item.title || item.name)}`" class="hover:underline underline-offset-2">
                <div class="overflow-ellipsis whitespace-nowrap overflow-hidden mt-1 text-neutral-200 text-2xs md:text-sm
                    flex items-center gap-2">
                    <div>
                        <SeoImg :src="watchOptionImageMapper[item.watchProviderName]?.image"
                            class="max-md:w-6 max-md:h-6 md:w-7 md:h-7" :alt="item.watchProviderName"></SeoImg>
                    </div>
                    <div class="flex-grow">
                        {{ item.character || item.title || item.name }}
                    </div>
                </div>
            </NuxtLink>
        </div>

        <!-- Hover Card -->
        <HoverCard 
            v-if="fullItem"
            :is-open="showHoverCard"
            :item="fullItem"
            :bounds="cardBounds"
            @mouseenter="cancelClose"
            @mouseleave="startClose"
            @click="navigateToPage"
            @play="openModal"
        />

        <!-- Quick View Modal -->
        <QuickViewModal 
            v-if="fullItem"
            v-model="showModal"
            :item="fullItem"
        />
    </div>
</template>

<script setup lang="ts">
import { watchOptionImageMapper } from '~/utils/watchOptions';

const props = defineProps({
    item: {
        type: Object,
        required: true,
        default: {}
    },
});

const imagePath = ref(getCdnImage(props.item, IMAGE_TYPE.WIDE_CARD));

// Use hover card composable
const {
    cardContainer,
    cardBounds,
    showHoverCard,
    showModal,
    fullItem,
    onMouseEnter,
    onMouseLeave,
    cancelClose,
    startClose,
    navigateToPage,
    openModal
} = useHoverCard(toRef(props, 'item'));

const imageError = () => {
    imagePath.value = `https://image.tmdb.org/t/p/${configuration.images.poster_sizes.w500}${props.item.backdrop_path}`;
};
</script>
