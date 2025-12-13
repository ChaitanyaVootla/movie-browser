<template>
    <div class="flex -mt-2">
        <div v-if="processedRatings.length" v-for="rating in processedRatings">
            <NuxtLink v-bind="props" v-if="rating.image" :to="rating.link" target="blank" rel="noreferrer noopener"
                :aria-label="`Rating link for ${rating.name}`">
                <div class="progress-wrapper relative w-full h-full">
                    <svg :width="small?45:70" :height="small?45:70" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="35" stroke="#333" stroke-width="10" fill="transparent"
                            :stroke-dasharray="`${164} 1000`" stroke-dashoffset="-39.25" transform="rotate(72 50 50)" stroke-linecap="round" />
                        <circle cx="50" cy="50" r="35" :stroke="rating.color" stroke-width="7" fill="transparent"
                            :stroke-dasharray="`${rating.percentage*164/100} 1000`" stroke-dashoffset="-39.25" transform="rotate(72 50 50)" stroke-linecap="round" />
                        <image :href="rating.image" x="35" y="35" height="30" width="30" />
                        <text v-if="!minimal" x="50" y="85" font-family="Arial" font-size="14" fill="#ddd" text-anchor="middle"
                            class="font-normal text-base" :class="small?'!text-xl':''" letter-spacing="1">
                            {{ rating.percentage }}
                        </text>
                    </svg>
                </div>
            </NuxtLink>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps(['ratings', 'small', 'minimal'])

type ProcessedRating = {
    name: string,
    link: string,
    rating: string,
    image: string,
    color: string,
    percentage: number
};

// Image mapping for different rating sources (only show specific sources)
const ratingImageMapper = {
    'tmdb': '/images/rating/tmdb.svg',
    'imdb': '/images/rating/imdb.svg',
    'google': '/images/rating/google.svg',
} as Record<string, string>;


// Rotten Tomatoes specific image mapping based on certification and sentiment
const getRottenTomatoesImage = (rating: any) => {
    const isAudience = rating.name.toLowerCase().includes('audience');
    const isCertified = rating.certified;
    const isNegative = rating.sentiment === 'NEGATIVE';
    
    if (isAudience) {
        if (isCertified) return '/images/rating/rt_audience_certified.svg';
        if (isNegative) return '/images/rating/rt_audience_negative.svg';
        return '/images/rating/rt_audience.svg';
    } else {
        if (isCertified) return '/images/rating/rt_critic_certified.svg';
        if (isNegative) return '/images/rating/rt_critic_negative.svg';
        return '/images/rating/rt_critic.svg';
    }
};

// Get color based on rating value (0-100 scale)
const getColorForRating = (rating: number) => {
    const cutoff = 30;
    const safeValue = Math.max(cutoff, Math.min(100, rating));
    const scaledValue = safeValue - cutoff;
    const hue = (120 * scaledValue) / 70;
    return `hsl(${hue}, 100%, 35%)`;
};

// Process the ratings from the backend (only show specific sources)
const processedRatings = computed(() => {
    if (!props.ratings || !Array.isArray(props.ratings)) {
        return [];
    }

    // Only show these specific sources (case-insensitive matching)
    const allowedSources = ['TMDB', 'IMDb', 'Rotten Tomatoes', 'Rotten Tomatoes (Audience)', 'Google'];
    
    const filtered = props.ratings.filter((rating: any) => {
        const ratingName = rating.name.toLowerCase();
        return allowedSources.some(allowed => 
            ratingName.includes(allowed.toLowerCase()) || 
            (allowed.toLowerCase() === 'google' && ratingName.includes('google'))
        );
    });
    
    const processed = filtered.map((rating: any) => {
        const ratingNumber = parseInt(rating.rating);
        const sourceName = rating.name.toLowerCase();
        let type = '';
        
        // Get appropriate image based on source
        let image = '';
        if (sourceName.includes('rotten')) {
            image = getRottenTomatoesImage(rating);
            if (sourceName.includes('audience')) {
                type = 'rt_audience';
            } else {
                type = 'rt_critic';
            }
        } else if (sourceName.includes('google')) {
            image = '/images/rating/google.svg';
            type = 'google';
        } else if (sourceName.includes('imdb')) {
            image = '/images/rating/imdb.svg';
            type = 'imdb';
        } else if (sourceName.includes('tmdb')) {
            image = '/images/rating/tmdb.svg';
            type = 'tmdb';
        } else {
            // Fallback: try the mapping
            for (const [key, value] of Object.entries(ratingImageMapper)) {
                if (sourceName.includes(key)) {
                    image = value;
                    type = key;
                    break;
                }
            }
        }

        return {
            name: rating.name,
            link: rating.link,
            rating: rating.rating,
            image,
            color: getColorForRating(ratingNumber),
            percentage: ratingNumber,
            type
        };
    });
    
    // Unique the ratings by type
    const uniqueRatings = [] as any[];
    const seenTypes = new Set();
    
    for (const rating of processed) {
        if (rating.image) {
            if (rating.type && seenTypes.has(rating.type)) {
                continue;
            }
            if (rating.type) {
                seenTypes.add(rating.type);
            }
            uniqueRatings.push(rating);
        }
    }
    
    return uniqueRatings;
});
</script>
