<template>
    <div class="flex -mt-2">
        <div v-if="ratings.length" v-for="rating in ratings">
            <NuxtLink v-bind="props" v-if="rating.image" :to="rating.link" target="blank" noreferrer noopener>
                <div class="progress-wrapper relative w-full h-full">
                    <svg :width="small?55:70" :height="small?55:70" viewBox="0 0 100 100">
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
const props = defineProps(['googleData', 'tmdbRating', 'itemId', 'small', 'title', 'minimal', 'voteCount'])
type Rating = {
    name: string,
    link: string,
    rating: string,
    image: string,
    color: string,
    percentage: number
};
let ratings = [] as Rating[];

const getColorForRating = (ratingObj: Rating) => {
    let ratingString = `${ratingObj.rating}`;
    if (ratingString.includes('%')) {
        ratingString = ratingString.split('%')[0];
    }
    let ratingNumber = parseFloat(ratingString);
    if (ratingObj.name === 'IMDb') {
        ratingNumber *= 10;
    } else if (ratingObj.name === 'TMDB') {
        ratingNumber *= 10;
    } else if (ratingObj.name === 'Crunchyroll') {
        ratingNumber *= 20;
    }
    const cutoff = 30;
    const safeValue = Math.max(cutoff, Math.min(100, ratingNumber));
    const scaledValue = safeValue - cutoff;
    const hue = (120 * scaledValue) / 70;
    return {
        color: `hsl(${hue}, 100%, 35%)`,
        percentage: parseInt(ratingNumber.toFixed())
    };
}

const ratingImageMapper = {
    'imdb': '/images/rating/imdb.svg',
    'rotten': '/images/rating/rottenTomatoes.svg',
    'google': '/images/rating/google.svg',
    // 'crunchyroll': '/images/rating/crunchyroll.png',
} as Record<string, string>;

if (props.googleData?.ratings) {
    ratings = (props.googleData.ratings || []).map((rating: any) => {
        const image = ratingImageMapper[rating.name.split(' ')[0].toLowerCase()]
        if (image) {
            return {
                name: rating.name,
                link: rating.link,
                rating: rating.rating,
                image,
                ...getColorForRating(rating)
            }
        }
    }).filter(Boolean)
}
if (props.tmdbRating) {
    ratings.unshift({
        name: 'TMDB',
        rating: props.tmdbRating?.toFixed(1) || '',
        image: '/images/rating/tmdb.svg',
        link: `https://www.themoviedb.org/${props.title?'movie':'tv'}/${props.itemId}`,
        ...getColorForRating({
            name: 'TMDB',
            rating: props.tmdbRating,
        } as Rating)
    })
}
</script>
