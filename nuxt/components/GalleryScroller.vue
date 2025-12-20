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
        max-width="95vw"
        max-height="95vh"
        :persistent="false"
        @click:outside="closeGallery"
        @keydown.esc="closeGallery"
        class="gallery-modal"
        :fullscreen="$vuetify.display.mobile"
    >
        <v-card class="gallery-modal-card">
            <v-card-text class="gallery-card-content">
                <!-- Gallery Header -->
                <div class="gallery-header">
                    <div class="gallery-title">
                        <v-icon icon="mdi-image-multiple" class="mr-2"></v-icon>
                        Image Gallery
                    </div>
                    <div v-if="images.length > 1" class="gallery-counter-header">
                        {{ imageIndex + 1 }} / {{ images.length }}
                    </div>
                    <v-btn 
                        icon
                        variant="text" 
                        @click="closeGallery" 
                        class="gallery-close-btn"
                    >
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </div>

                <!-- Main Image Display -->
                <div class="gallery-main-content">
                    <!-- Navigation buttons -->
                    <v-btn 
                        v-if="images.length > 1"
                        icon
                        variant="elevated" 
                        color="surface-variant"
                        size="default"
                        @click="previousImage" 
                        class="gallery-nav-btn gallery-prev-btn"
                        elevation="2"
                    >
                        <v-icon>mdi-chevron-left</v-icon>
                    </v-btn>

                    <!-- Image container -->
                    <div class="gallery-image-container">
                        <SeoImg 
                            :key="`gallery-${imageIndex}-${currentImage?.file_path || 'unknown'}`"
                            :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.original}${currentImage?.file_path || ''}`"
                            :alt="`Gallery image ${currentImage?.file_path ? currentImage.file_path.split('/').pop() : 'from collection'}`"
                            class="gallery-image"
                        >
                            <template #placeholder>
                                <v-skeleton-loader type="image" class="gallery-image" />
                            </template>
                            <template #error>
                                <div class="gallery-image bg-neutral-700 rounded-lg flex items-center justify-center">
                                    <v-icon size="64" color="neutral-400">mdi-image-broken</v-icon>
                                </div>
                            </template>
                        </SeoImg>
                    </div>

                    <v-btn 
                        v-if="images.length > 1"
                        icon
                        variant="elevated" 
                        color="surface-variant"
                        size="default"
                        @click="nextImage" 
                        class="gallery-nav-btn gallery-next-btn"
                        elevation="2"
                    >
                        <v-icon>mdi-chevron-right</v-icon>
                    </v-btn>
                </div>

                <!-- Gallery Footer with Thumbnails (optional) -->
                <div v-if="images.length > 1" class="gallery-footer">
                    <div class="gallery-thumbnails">
                        <div 
                            v-for="(image, index) in images" 
                            :key="(image as any)?.file_path || index"
                            @click="imageIndex = index"
                            :class="['gallery-thumbnail', { 'active': index === imageIndex }]"
                        >
                            <SeoImg 
                                :src="`https://image.tmdb.org/t/p/w185${(image as any)?.file_path || ''}`"
                                :alt="`Thumbnail ${index + 1}`"
                                class="thumbnail-image"
                            >
                                <template #placeholder>
                                    <div class="thumbnail-placeholder"></div>
                                </template>
                                <template #error>
                                    <div class="thumbnail-error"></div>
                                </template>
                            </SeoImg>
                        </div>
                    </div>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { configuration } from '~/utils/constants'

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

// Computed property for current image
const currentImage = computed(() => {
    return props.images[imageIndex.value] as any || {};
});

const openGallery = (file_path: any) => {
    imageIndex.value = props.images.findIndex((i: any) => i.file_path === file_path);
    dialog.value = true;
};

const closeGallery = () => {
    dialog.value = false;
};

const nextImage = () => {
    if (imageIndex.value < props.images.length - 1) {
        imageIndex.value++;
    } else {
        imageIndex.value = 0; // Loop back to first image
    }
};

const previousImage = () => {
    if (imageIndex.value > 0) {
        imageIndex.value--;
    } else {
        imageIndex.value = props.images.length - 1; // Loop to last image
    }
};

// Keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
    if (!dialog.value) return;
    
    switch (event.key) {
        case 'ArrowRight':
            event.preventDefault();
            nextImage();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            previousImage();
            break;
        case 'Escape':
            event.preventDefault();
            closeGallery();
            break;
    }
};

// Add keyboard listeners when component mounts
onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
});

// Clean up listeners when component unmounts
onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped lang="less">
// Gallery Modal Card Styling
.gallery-modal {
    :deep(.v-overlay__content) {
        width: 95vw !important;
        height: 95vh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
    }
}

.gallery-modal-card {
    width: 100% !important;
    height: 95vh !important;
    max-height: 95vh !important;
    background: linear-gradient(135deg, rgba(18, 18, 18, 0.98), rgba(0, 0, 0, 0.95)) !important;
    border-radius: 20px !important;
    border: 2px solid rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(20px) !important;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6) !important;
    overflow: hidden !important;
}

.gallery-card-content {
    height: 100% !important;
    max-height: 95vh !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
}

// Gallery Header
.gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem 0.75rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    min-height: 60px;
}

.gallery-title {
    display: flex;
    align-items: center;
    font-size: 1.1rem;
    font-weight: 500;
    color: #ffffff;
    letter-spacing: 0.3px;
}

.gallery-counter-header {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    padding: 0.4rem 0.8rem;
    border-radius: 16px;
    font-size: 0.8rem;
    font-weight: 500;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.gallery-close-btn {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    
    &:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        transform: scale(1.05);
    }
}

// Main Gallery Content
.gallery-main-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 1.25rem;
    gap: 1.25rem;
    min-height: 0; // Allows flex child to shrink
    overflow: hidden; // Prevent content from overflowing
}

.gallery-image-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%; // Take available height from flex parent
    width: 100%;
    min-height: 200px; // Minimum height to ensure space
    border-radius: 12px;
    overflow: hidden;
    background: transparent;
    position: relative;
}

.gallery-image {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center;
    border-radius: 8px;
    display: block;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    
    // Ensure image doesn't get too small on very wide screens
    min-width: 200px;
    min-height: 150px;
}

.gallery-nav-btn {
    background: rgba(255, 255, 255, 0.85) !important;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    
    &:hover {
        background: rgba(255, 255, 255, 0.95) !important;
        transform: scale(1.05);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.35);
    }
}

// Gallery Footer with Thumbnails
.gallery-footer {
    padding: 0.75rem 1.5rem 1rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    min-height: 80px;
    flex-shrink: 0; // Prevent footer from shrinking
}

.gallery-thumbnails {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    
    &::-webkit-scrollbar {
        height: 6px;
    }
    
    &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
    }
    
    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        
        &:hover {
            background: rgba(255, 255, 255, 0.5);
        }
    }
}

.gallery-thumbnail {
    min-width: 80px;
    height: 45px;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.3s ease;
    
    &:hover {
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.05);
    }
    
    &.active {
        border-color: #ffffff;
        box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
    }
}

.thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.thumbnail-placeholder,
.thumbnail-error {
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
}

// Mobile Responsive
@media (max-width: 768px) {
    .gallery-modal {
        :deep(.v-overlay__content) {
            width: 100vw !important;
            height: 100vh !important;
        }
    }
    
    .gallery-modal-card {
        border-radius: 0 !important;
        border: none !important;
        height: 100vh !important;
        max-height: 100vh !important;
    }
    
    .gallery-card-content {
        max-height: 100vh !important;
    }
    
    .gallery-header {
        padding: 0.75rem 1rem 0.5rem 1rem;
        min-height: 50px;
    }
    
    .gallery-title {
        font-size: 1rem;
    }
    
    .gallery-counter-header {
        padding: 0.3rem 0.6rem;
        font-size: 0.75rem;
    }
    
    .gallery-main-content {
        padding: 1rem;
        gap: 1rem;
    }
    
    .gallery-image-container {
        height: 100%; // Use relative height instead of fixed
        min-height: 250px; // Ensure adequate space on mobile
    }
    
    .gallery-nav-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
        
        &.gallery-prev-btn {
            left: 0.5rem;
        }
        
        &.gallery-next-btn {
            right: 0.5rem;
        }
    }
    
    .gallery-footer {
        padding: 0.5rem 1rem 0.75rem 1rem;
        min-height: 70px;
    }
    
    .gallery-thumbnails {
        gap: 0.5rem;
    }
    
    .gallery-thumbnail {
        min-width: 55px;
        height: 31px;
    }
}

// Dark mode adjustments
:deep(.v-theme--dark) {
    .gallery-nav-btn {
        background: rgba(38, 38, 38, 0.9) !important;
        color: white !important;
        
        &:hover {
            background: rgba(50, 50, 50, 1) !important;
        }
    }
}
</style>