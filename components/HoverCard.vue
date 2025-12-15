<template>
  <Teleport to="body">
    <div v-if="isOpen && item"
         class="fixed z-[9999] rounded-lg overflow-hidden bg-black border border-neutral-800 transition-all duration-300 ease-out origin-center cursor-pointer"
         :style="cardStyle"
         @mouseenter="emit('mouseenter')"
         @mouseleave="emit('mouseleave')"
         @click="emit('click')"
         style="box-shadow: 0 0 60px 15px rgba(0, 0, 0, 0.9);">
         
         <div class="flex flex-col w-full h-full relative">
            <!-- Top Section: Backdrop / Video (Fixed Aspect Ratio 16:9) -->
            <div class="relative w-full shrink-0 aspect-video bg-black">
                <SeoImg :src="backdropUrl" 
                    class="w-full h-full object-cover transition-transform duration-700 ease-in-out" 
                    :alt="item.title || item.name"
                />
                <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90"></div>
                
                <div class="absolute bottom-3 left-4 z-10 w-[90%]">
                     <h3 class="text-white font-bold text-xl leading-tight line-clamp-2 drop-shadow-md">
                        {{ item.title || item.name }}
                     </h3>
                </div>
            </div>

            <!-- Bottom Section: Info & Actions -->
            <div class="flex-grow p-4 flex flex-col gap-3 bg-black select-none overflow-hidden">
                 <!-- Actions Row with Like/Dislike Bar -->
                 <div class="flex items-center gap-2" v-if="isExpanded">
                     <!-- Play Trailer Button -->
                     <v-btn
                        color="white"
                        variant="flat"
                        size="small"
                        class="!text-black !font-bold flex-shrink-0"
                        prepend-icon="mdi-play"
                        @click.stop="emit('play')"
                     >
                        Trailer
                     </v-btn>

                     <!-- Like/Dislike Bar Inline -->
                     <div v-if="videoStats" class="flex items-center bg-neutral-800 rounded-full px-3 py-1 text-xs gap-2 flex-shrink-0">
                         <div class="flex items-center gap-1">
                             <v-icon icon="mdi-thumb-up-outline" size="x-small"></v-icon>
                             <span class="font-semibold">{{ formatNumber(videoStats.likes || 0) }}</span>
                         </div>
                         <div class="border-r border-neutral-600 h-3"></div>
                         <div class="flex items-center gap-1">
                             <v-icon icon="mdi-thumb-down-outline" size="x-small"></v-icon>
                             <span class="font-semibold">{{ formatNumber(videoStats.dislikes || 0) }}</span>
                         </div>
                         <div class="w-16">
                             <v-progress-linear 
                                 :model-value="videoLikePercentage" 
                                 :height="2" 
                                 bg-opacity="0.3"
                                 rounded
                             ></v-progress-linear>
                         </div>
                     </div>

                     <!-- Spacer to push action buttons to the right -->
                     <div class="flex-grow"></div>

                     <!-- Action Buttons (Right Edge) -->
                     <div class="flex gap-2">
                        <v-btn icon size="x-small" variant="outlined" color="white" class="!border-neutral-600 bg-neutral-800/80" 
                            :title="inWatchList ? 'Remove from Watchlist' : 'Add to Watchlist'" @click.stop="toggleWatchList">
                            <v-icon :color="inWatchList ? 'primary' : 'white'">{{ inWatchList ? 'mdi-check' : 'mdi-plus' }}</v-icon>
                        </v-btn>
                        <v-btn v-if="isMovieItem" icon size="x-small" variant="outlined" color="white" class="!border-neutral-600 bg-neutral-800/80"
                            :title="watched ? 'Mark as Unwatched' : 'Mark as Watched'" @click.stop="toggleWatch">
                            <v-icon :color="watched ? 'primary' : 'white'">{{ watched ? 'mdi-eye' : 'mdi-eye-outline' }}</v-icon>
                        </v-btn>
                        <v-btn icon size="x-small" variant="outlined" color="white" class="!border-neutral-600 bg-neutral-800/80"
                                title="Share" @click.stop="shareItem">
                                <v-icon>mdi-share</v-icon>
                        </v-btn>
                        <v-btn icon size="x-small" variant="outlined" color="white" class="!border-neutral-600 bg-neutral-800/80"
                                title="More Info" @click.stop="emit('play')">
                                <v-icon>mdi-chevron-down</v-icon>
                        </v-btn>
                     </div>
                 </div>


                 <!-- Ratings Section -->
                 <div v-if="isExpanded && item.ratings?.length" class="flex items-center mt-2" @click.stop>
                     <Ratings :ratings="item.ratings" :small="true" />
                 </div>

                 <!-- Watch Options Section -->
                 <div v-if="isExpanded && item.watch_options" class="scale-75 origin-left mt-2" @click.stop>
                     <WatchOptions 
                         :item="item"
                         :compact="true"
                     />
                 </div>

                 <!-- Spacer to push metadata to bottom -->
                 <div class="flex-grow"></div>

                 <!-- Metadata Row: Year, Runtime/Seasons, Genres -->
                 <div v-if="isExpanded" class="flex flex-nowrap items-center gap-x-3 text-xs text-neutral-400 mt-auto mb-2 overflow-hidden">
                     <span v-if="year" class="text-white shrink-0">{{ year }}</span>
                     <span v-if="item.runtime" class="text-white shrink-0">{{ formatRuntime(item.runtime) }}</span>
                     <span v-if="item.number_of_seasons" class="text-white shrink-0">
                        {{ item.number_of_seasons }} {{ item.number_of_seasons === 1 ? 'Season' : 'Seasons' }}
                     </span>
                     
                     <!-- Genres with overflow handling -->
                     <div class="flex flex-nowrap items-center gap-x-3 overflow-hidden" v-if="item.genres?.length">
                        <span v-for="genre in visibleGenres" :key="genre.id" class="text-neutral-500 whitespace-nowrap shrink-0">
                           {{ genre.name }}
                        </span>
                     </div>
                 </div>
            </div>
         </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core';
import { userStore } from '~/plugins/state';
import { isMovie } from '~/utils/movieIdentifier';
import { computed, ref, watch } from 'vue';
import { findPrimaryTrailer } from '~/utils/video';

const props = defineProps({
    isOpen: Boolean,
    item: Object,
    bounds: Object 
});

const emit = defineEmits(['mouseenter', 'mouseleave', 'click', 'play']);
const { width: windowWidth, height: windowHeight } = useWindowSize();
const userData = userStore();
const { status } = useAuth();
const isExpanded = ref(false);
const videoStats = ref<any>(null);

// Format number utility (same as in VideoGallery)
const formatNumber = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
};

const videoLikePercentage = computed(() => {
    if (!videoStats.value) return 0;
    const total = videoStats.value.likes + videoStats.value.dislikes;
    if (total === 0) return 0;
    return (videoStats.value.likes / total) * 100;
});

// Fetch video statistics when expanded and item has videos
watch([() => props.item, isExpanded], async ([newItem, expanded]) => {
    if (!expanded || !newItem) {
        videoStats.value = null;
        return;
    }
    
    const trailer = findPrimaryTrailer(newItem.videos);
    if (trailer?.key) {
        try {
            videoStats.value = await $fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${trailer.key}`);
        } catch (e) {
            console.error('Failed to fetch video stats', e);
            videoStats.value = null;
        }
    }
});

const backdropUrl = computed(() => {
    if (!props.item) return '';
    return props.item.backdrop_path 
        ? `https://image.tmdb.org/t/p/w780${props.item.backdrop_path}` 
        : (props.item.poster_path ? `https://image.tmdb.org/t/p/w500${props.item.poster_path}` : '');
});

const year = computed(() => {
    if (!props.item) return '';
    const date = props.item.release_date || props.item.first_air_date;
    return date ? new Date(date).getFullYear() : '';
});

const formatRuntime = (minutes: number) => {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Visible genres - limit to what fits in one line
const visibleGenres = computed(() => {
    if (!props.item?.genres) return [];
    // Show up to 3 genres to avoid overflow
    return props.item.genres.slice(0, 3);
});

// Store Logic
const isMovieItem = computed(() => isMovie(props.item));

const watched = computed(() => {
    if (status.value !== 'authenticated' || !props.item?.id) return false;
    return isMovieItem.value ? userData.isMovieWatched(props.item.id) : false;
});

const inWatchList = computed(() => {
     if (status.value !== 'authenticated' || !props.item?.id) return false;
     return isMovieItem.value ? userData.isMovieInWatchList(props.item.id) : false;
});

const toggleWatch = () => {
    if (!isMovieItem.value || !props.item) return; 
    userData.toggleWatchMovie(props.item.id);
};

const toggleWatchList = () => {
    if (!isMovieItem.value || !props.item) return; 
    userData.toggleMovieWatchList(props.item.id);
};

const shareItem = () => {
    if (!props.item) return;
    const type = isMovieItem.value ? 'movie' : 'series';
    const title = props.item.title || props.item.name;
    const url = `https://themoviebrowser.com/${type}/${props.item.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: title,
            url: url
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(url);
    }
};

// Animation Logic
const isScaling = ref(false);
let expandTimeout: any = null;

watch(() => props.isOpen, (newVal) => {
    clearTimeout(expandTimeout);
    if (newVal) {
        isExpanded.value = false;
        requestAnimationFrame(() => {
            isScaling.value = true;
            expandTimeout = setTimeout(() => {
                isExpanded.value = true;
            }, 300);
        });
    } else {
        isScaling.value = false;
        isExpanded.value = false;
    }
});

const cardStyle = computed(() => {
    if (!props.bounds || !props.isOpen) return { display: 'none' };

    const { top, left, width, height } = props.bounds;

    if (!isScaling.value) {
        return {
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`,
            zIndex: 9999,
        };
    }

    // Expanded State - Use fixed target width for consistency
    const targetWidth = 500; // Increased width to ensure all buttons fit comfortably
    
    const imageHeight = targetWidth * (9/16);
    const infoHeight = 250; // Increased to accommodate ratings, watch options, and metadata
    
    // Ensure total height is at least slightly taller than the original card to cover it
    let targetHeight = imageHeight + infoHeight;
    const minHeight = height + 40; 
    if (targetHeight < minHeight) targetHeight = minHeight;

    // Always center perfectly over the base card - no viewport adjustments
    const centerX = left + (width / 2);
    const centerY = top + (height / 2);

    const newLeft = centerX - (targetWidth / 2);
    const newTop = centerY - (targetHeight / 2);

    return {
        top: `${newTop}px`,
        left: `${newLeft}px`,
        width: `${targetWidth}px`,
        height: `${targetHeight}px`,
        zIndex: 9999,
    };
});
</script>

<style scoped>
</style>
