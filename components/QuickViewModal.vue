<template>
    <v-dialog v-model="isOpen" max-width="900" transition="dialog-bottom-transition">
        <v-card class="!bg-neutral-900 !shadow-2xl !border !border-neutral-800">
            <!-- Video Player / Backdrop -->
            <div class="aspect-video w-full relative bg-black overflow-hidden">
                <!-- Close Button -->
                <v-btn 
                    icon="mdi-close" 
                    variant="text" 
                    size="small" 
                    class="!absolute top-3 right-3 z-[9999] text-white !bg-black/60 hover:!bg-black/80 shadow-lg" 
                    @click="isOpen = false">
                </v-btn>

                <iframe v-if="trailerKey" 
                    :src="`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=0&rel=0&showinfo=0&modestbranding=1`" 
                    class="w-full h-full absolute inset-0" 
                    frameborder="0" 
                    allowfullscreen 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                </iframe>
                <div v-else class="w-full h-full relative">
                     <SeoImg :src="backdropUrl" class="w-full h-full object-cover opacity-60" />
                     <div class="absolute inset-0 flex items-center justify-center">
                         <div class="text-neutral-500 flex flex-col items-center">
                             <v-icon icon="mdi-play-network-outline" size="64" class="mb-2 opacity-50"></v-icon>
                             <span>No Trailer Available</span>
                         </div>
                     </div>
                </div>
            </div>

            <!-- Content -->
            <v-card-text class="!bg-neutral-900 pa-6 pa-md-8">
                <!-- Header -->
                <h2 class="text-xl md:text-2xl font-bold text-white leading-tight mb-3">
                    <NuxtLink :to="linkToPage" class="hover:text-primary transition-colors">
                        {{ item.title || item.name }}
                    </NuxtLink>
                </h2>

                <!-- Meta Info -->
                <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-400 mb-4">
                    <span v-if="year" class="text-white">{{ year }}</span>
                    <span v-if="item.runtime" class="flex items-center gap-1 text-neutral-300">
                        <v-icon icon="mdi-clock-outline" size="small"></v-icon>
                        {{ formatRuntime(item.runtime) }}
                    </span>
                    <span v-if="item.number_of_seasons" class="text-white">
                        {{ item.number_of_seasons }} {{ item.number_of_seasons === 1 ? 'Season' : 'Seasons' }}
                    </span>
                    <span v-if="item.status" class="px-2 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-xs uppercase tracking-wider">
                        {{ item.status }}
                    </span>
                </div>

                <!-- Ratings -->
                <div class="mb-5 -ml-2">
                    <Ratings :ratings="item.ratings"/>
                </div>
                
                <!-- Genres -->
                <div class="flex flex-wrap gap-2 mb-4" v-if="item.genres?.length">
                    <span v-for="genre in item.genres" :key="genre.id" 
                        class="text-xs text-neutral-300 border border-neutral-700 px-3 py-1 rounded-full bg-neutral-800/50 hover:bg-neutral-800 transition-colors">
                        {{ genre.name }}
                    </span>
                </div>

                <!-- Overview -->
                <div class="text-neutral-300 text-sm leading-relaxed mb-5">
                    {{ item.overview }}
                </div>

                <!-- Watch Options -->
                <div v-if="item.watchProviders || item.watch_options" class="mb-5">
                    <WatchOptions :item="item" :googleData="item.googleData" />
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-wrap items-center gap-2">
                    <v-btn 
                        :to="linkToPage" 
                        color="white" 
                        variant="flat" 
                        class="!text-black !font-semibold" 
                        prepend-icon="mdi-information-outline">
                        MORE DETAILS
                    </v-btn>
                    
                    <v-btn 
                        icon
                        variant="outlined" 
                        color="white" 
                        class="!border-neutral-600 hover:!bg-neutral-800"
                        :title="inWatchList ? 'Remove from Watchlist' : 'Add to Watchlist'"
                        @click="toggleWatchList">
                        <v-icon :color="inWatchList ? 'primary' : 'white'">{{ inWatchList ? 'mdi-check' : 'mdi-plus' }}</v-icon>
                    </v-btn>
                    
                    <v-btn 
                        v-if="isMovieItem"
                        icon
                        variant="outlined" 
                        color="white" 
                        class="!border-neutral-600 hover:!bg-neutral-800"
                        :title="watched ? 'Mark as Unwatched' : 'Mark as Watched'"
                        @click="toggleWatch">
                        <v-icon :color="watched ? 'primary' : 'white'">{{ watched ? 'mdi-eye' : 'mdi-eye-outline' }}</v-icon>
                    </v-btn>
                    
                    <v-btn 
                        icon
                        variant="outlined" 
                        color="white" 
                        class="!border-neutral-600 hover:!bg-neutral-800"
                        title="Share"
                        @click="shareItem">
                        <v-icon>mdi-share</v-icon>
                    </v-btn>
                </div>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { userStore } from '~/plugins/state';
import { isMovie } from '~/utils/movieIdentifier';
import { findPrimaryTrailer } from '~/utils/video';

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    item: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});

const trailerKey = computed(() => {
    if (!props.item?.videos?.results) return null;
    const trailer = findPrimaryTrailer(props.item.videos);
    return trailer ? trailer.key : null;
});

const backdropUrl = computed(() => {
    if (props.item.backdrop_path) {
        return `https://image.tmdb.org/t/p/w1280${props.item.backdrop_path}`;
    }
    // Fallback to poster if no backdrop
    return props.item.poster_path ? `https://image.tmdb.org/t/p/w780${props.item.poster_path}` : '';
});

const year = computed(() => {
    const date = props.item.release_date || props.item.first_air_date;
    return date ? new Date(date).getFullYear() : '';
});

const linkToPage = computed(() => {
    const type = props.item.title ? 'movie' : 'series';
    return `/${type}/${props.item.id}/${getUrlSlug(props.item.title || props.item.name)}`;
});

const formatRuntime = (minutes: number) => {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// User Actions
const userData = userStore();
const { status } = useAuth();
const isMovieItem = computed(() => isMovie(props.item));

const watched = computed(() => {
    if (status.value !== 'authenticated' || !props.item?.id) return false;
    return isMovieItem.value ? userData.isMovieWatched(props.item.id) : false; // Series watched logic might differ
});

const inWatchList = computed(() => {
     if (status.value !== 'authenticated' || !props.item?.id) return false;
     return isMovieItem.value ? userData.isMovieInWatchList(props.item.id) : false;
});

const toggleWatch = () => {
    if (!isMovieItem.value) return; // Add series logic if available
    userData.toggleWatchMovie(props.item.id);
};

const toggleWatchList = () => {
    if (!isMovieItem.value) return; // Add series logic if available
    userData.toggleMovieWatchList(props.item.id);
};

const shareItem = () => {
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
</script>

