<template>
    <div class="episode-container">
        <div class="episode-content">
            <!-- Episode Header -->
            <div class="episode-header">
                <div class="episode-title">
                    Season {{ episode.season_number }} - {{ episode.name }}
                </div>
                <div class="episode-overview" v-if="episode.overview">
                    {{ episode.overview }}
                </div>
                <div class="episode-meta" v-if="episode.air_date">
                    <NuxtTime :datetime="new Date(episode.air_date)" year="numeric" month="long" day="numeric" />
                </div>
            </div>

            <!-- Episode Images Carousel -->
            <div class="episode-carousel-container" v-if="fullEpisode?.images?.stills?.length || episode.still_path">
                <v-carousel 
                    color="white" 
                    :cycle="false" 
                    hide-delimiters
                    class="episode-carousel"
                    height="auto"
                >
                    <template v-slot:prev="{ props }">
                        <v-btn 
                            icon
                            variant="elevated"
                            color="surface-variant"
                            size="small"
                            @click="props.onClick"
                            class="episode-carousel-nav episode-carousel-prev"
                        >
                            <v-icon>mdi-chevron-left</v-icon>
                        </v-btn>
                    </template>
                    <template v-slot:next="{ props }">
                        <v-btn 
                            icon
                            variant="elevated"
                            color="surface-variant"
                            size="small"
                            @click="props.onClick"
                            class="episode-carousel-nav episode-carousel-next"
                        >
                            <v-icon>mdi-chevron-right</v-icon>
                        </v-btn>
                    </template>
                    
                    <v-carousel-item 
                        v-for="item in (fullEpisode?.images?.stills || [episode])" 
                        :key="item.file_path || item.still_path"
                        class="episode-carousel-item"
                    >
                        <div class="episode-image-container">
                            <SeoImg 
                                :key="`episode-${item.still_path || item.file_path}`"
                                :src="`https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w1280}${item.still_path || item.file_path}`"
                                :alt="`${episode.name} still image`" 
                                class="episode-image"
                            >
                                <template #placeholder>
                                    <v-skeleton-loader type="image" class="episode-image" />
                                </template>
                                <template #error>
                                    <div class="episode-image bg-neutral-700 rounded-lg flex items-center justify-center">
                                        <v-icon size="48" color="neutral-400">mdi-image-broken</v-icon>
                                    </div>
                                </template>
                            </SeoImg>
                        </div>
                    </v-carousel-item>
                </v-carousel>
            </div>

            <!-- Watch Options -->
            <div class="episode-watch-options">
                <WatchOptions :googleData="series.googleData" :tmdbRating="series.vote_average" :item="series"/>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const { episode, series } = defineProps({
    episode: {
        type: Object,
        required: true,
    },
    series: {
        type: Object,
        required: true,
    },
});
const fullEpisode = await $fetch(`/api/series/${episode.show_id}/season/${episode.season_number}/episode/${episode.episode_number}`);
</script>

<style scoped lang="less">
.episode-container {
    width: 100%;
    max-width: 100%;
    background: transparent;
}

.episode-content {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    background: transparent; // Remove background to avoid double container
    border-radius: 0; // Let outer container handle rounding
    border: none; // Remove border
    backdrop-filter: none; // Remove blur
    box-shadow: none; // Remove shadow
    max-height: 80vh; // Constrain overall height
    overflow-y: auto; // Allow scrolling if needed
}

.episode-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0; // Prevent header from shrinking
}

.episode-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.3;
    
    @media (max-width: 768px) {
        font-size: 1rem;
    }
}

.episode-overview {
    font-size: 0.95rem;
    color: #d1d5db;
    line-height: 1.5;
    
    @media (max-width: 768px) {
        font-size: 0.875rem;
    }
}

.episode-meta {
    display: flex;
    align-items: center;
    font-size: 0.875rem;
    color: #9ca3af;
    font-weight: 500;
    
    @media (max-width: 768px) {
        font-size: 0.8rem;
    }
}

.episode-carousel-container {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.08);
    max-height: 450px; // Increased size for better viewing
    
    @media (max-width: 768px) {
        max-height: 300px;
    }
}

.episode-carousel {
    height: auto !important;
    max-height: 450px; // Increased maximum height
    min-height: 200px;
    
    @media (max-width: 768px) {
        max-height: 300px;
        min-height: 180px;
    }
}

.episode-carousel-item {
    height: auto !important;
    max-height: 450px;
    
    @media (max-width: 768px) {
        max-height: 300px;
    }
}

.episode-image-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-height: 450px; // Increased container height
    min-height: 200px;
    
    @media (max-width: 768px) {
        max-height: 300px;
        min-height: 180px;
    }
}

.episode-image {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain; // Prevent cropping
    object-position: center;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.episode-carousel-nav {
    position: absolute !important;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    background: rgba(255, 255, 255, 0.9) !important;
    backdrop-filter: blur(8px);
    
    &:hover {
        background: rgba(255, 255, 255, 1) !important;
        transform: translateY(-50%) scale(1.05);
    }
    
    &.episode-carousel-prev {
        left: 0.75rem;
    }
    
    &.episode-carousel-next {
        right: 0.75rem;
    }
}

.episode-watch-options {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0; // Ensure watch options are always visible
    margin-top: auto; // Push to bottom if needed
}

// Dark mode adjustments
:deep(.v-theme--dark) {
    .episode-carousel-nav {
        background: rgba(38, 38, 38, 0.9) !important;
        color: white !important;
        
        &:hover {
            background: rgba(50, 50, 50, 1) !important;
        }
    }
}

// Mobile responsive adjustments
@media (max-width: 768px) {
    .episode-content {
        padding: 1rem;
        gap: 1rem;
        max-height: 90vh; // More space on mobile
    }
    
    .episode-header {
        gap: 0.4rem;
    }
    
    .episode-carousel-nav {
        transform: translateY(-50%) scale(0.9);
        
        &.episode-carousel-prev {
            left: 0.5rem;
        }
        
        &.episode-carousel-next {
            right: 0.5rem;
        }
        
        &:hover {
            transform: translateY(-50%) scale(0.95);
        }
    }
    
    .episode-watch-options {
        padding: 0.75rem;
    }
}
</style>