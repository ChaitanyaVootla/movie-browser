<template>
    <div class="flex">
        <div v-if="ratings.length || props.tmdbRating"
            class="flex gap-8 px-8 pt-3 pb-2 backdrop-blur-lg border-2 border-neutral-600 rounded-pill">
            <div v-for="rating in ratings">
                <NuxtLink v-if="rating.image" :to="rating.link" target="blank" noreferrer noopener>
                    <div class="w-12 flex flex-col items-center justify-between gap-2">
                        <v-img :src="rating.image" class="w-7 h-7" :alt="rating.name">
                        </v-img>
                        <div class="text-md text-neutral-200">{{ rating.rating }}</div>
                    </div>
                </NuxtLink>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps(['googleData', 'tmdbRating', 'movieId'])
let ratings = [] as {
    name: string,
    link: string,
    rating: string,
    image: string,
}[]

const ratingImageMapper = {
    'imdb': '/images/rating/imdb.svg',
    'rotten': '/images/rating/rottenTomatoes.svg',
    'google': '/images/rating/google.svg',
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
            }
        }
    }).filter(Boolean)
}
ratings.unshift({
    name: 'TMDB',
    rating: props.tmdbRating?.toFixed(1) || '',
    image: '/images/rating/tmdb.svg',
    link: `https://www.themoviedb.org/movie/${props.movieId}`
})
</script>
