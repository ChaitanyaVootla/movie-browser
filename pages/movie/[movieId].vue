<template>
    <div>
        <div v-if="pending" class="pending w-full h-full">
            <v-skeleton-loader
                class="min-w-full h-full"
                max-width="300"
                type="image"
            ></v-skeleton-loader>
        </div>
        <div v-else>
            <DetailsTopInfo :item="movie" :watched="watched" @watch-clicked="watchClicked"/>
            <div class="pt-10">
                <div class="px-3 md:mx-12 overview">
                    <v-card class="px-5 py-5" color="#151515">
                        <div class="flex items-baseline justify-start gap-2">
                            <div class="text-xl">Released</div>
                            <NuxtTime v-if="movie.release_date" class="text-neutral-200 mt-2 block" :datetime="new Date(movie.release_date)"
                                year="numeric" month="long" day="numeric" />
                        </div>
                        <div class="text-neutral-300 mt-3 text">
                            {{ movie.overview }}
                        </div>

                        <div class="flex flex-wrap gap-3 mt-5">
                            <v-chip v-for="keyword in (movie?.keywords?.keywords || [])" class="rounded-pill" :color="'#ddd'">
                                {{ keyword.name }}
                            </v-chip>
                        </div>
                    </v-card>
                </div>

                <div v-if="movie?.collectionDetails?.parts?.length" class="px-3 md:px-0 cast mt-10">
                    <Scroller :items="movie.collectionDetails.parts || []" :title="movie.collectionDetails.name" :pending="pending" />
                </div>

                <div class="px-3 md:px-20 mt-10">
                    <Scroller :items="movie.credits?.cast || []" title="Cast" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div class="px-3 md:px-20 mt-10">
                    <Scroller :items="movie.credits?.crew || []" title="Crew" :pending="pending" >
                        <template v-slot:default="{ item }">
                            <PersonCard :item="item" :pending="pending" class="mr-3" />
                        </template>
                    </Scroller>
                </div>

                <div v-if="aiRecommendations?.length" class="px-3 md:px-0 marker:mt-10">
                    <Scroller :items="aiRecommendations || []" title="AI Recommendations" :pending="pending" />
                </div>

                <div v-if="!aiRecommendations?.length && movie.recommendations?.results?.length" class="px-3 md:px-0 mt-10">
                    <Scroller :items="movie.recommendations.results || []" title="Recommended" :pending="pending" />
                </div>

                <!-- <div v-if="movie.similar?.results?.length" class="mt-10">
                    <Scroller :items="movie.similar.results || []" title="Similar" :pending="pending" />
                </div> -->
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
let movie = ref({} as any);
let aiRecommendations = ref([] as any);
const headers = useRequestHeaders(['cookie']) as HeadersInit
const { data: movieAPI, pending } = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}`, {
        headers
    }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movie: any) => {
            if (!movie) return {};
            if (movie?.release_date) {
                movie.releaseYear = movie?.release_date?.split('-')[0];
                movie.fullReleaseString = movie?.release_date;
            }
            movie.credits.crew = useSortBy(movie.credits.crew, (person) => {
                if (person.job === 'Director') return 0;
                if (person.department === 'Directing') return 1;
                if (person.department === 'Writing') return 2;
                if (person.department === 'Production') return 3;
                if (person.department === 'Camera') return 4;
                return 100;
            });
            return {
                ...movie,
                youtubeVideos: ( movie.videos?.results?.filter((result: any) => result.site === 'YouTube') || [])?.sort(
                    (a: any, b: any) => {
                    if (a.type === 'Trailer' && b.type !== 'Trailer') {
                        return -1;
                    }
                    if (a.type !== 'Trailer' && b.type === 'Trailer') {
                        return 1;
                    }
                    if (a.type === 'Teaser' && b.type !== 'Teaser') {
                        return -1;
                    }
                    if (a.type !== 'Teaser' && b.type === 'Teaser') {
                        return 1;
                    }
                    return 0;
                }) || [],
            };
        }
    }
);
movie = movieAPI;

let watched = ref(false);
let { data: watchedAPI }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-watched`,
    () => $fetch(`/api/user/movie/${useRoute().params.movieId}/watched`, { headers }).catch((err) => {
        console.log(err);
        return {};
    })
);
watched.value = watchedAPI;

const watchClicked = (watchedSignal: boolean) => {
    watched.value = watchedSignal;
}

const { data: aiRecommendationsAPI }: any = await useLazyAsyncData(`movieDetails-${useRoute().params.movieId}-recommend`,
    () => $fetch(`/api/movie/${useRoute().params.movieId}/recommend`, { headers }).catch((err) => {
        console.log(err);
        return {};
    }),
    {
        transform: (movies: any) => {
            return movies;
        }
    }
);
aiRecommendations = aiRecommendationsAPI;
useHead(() => {
    return {
        title: movie.value?.title,
        meta: [
            {
                hid: 'description',
                name: 'description',
                content: movie.value?.overview
            },
            {
                hid: 'og:title',
                property: 'og:title',
                content: movie.value?.title
            },
            {
                hid: 'og:description',
                property: 'og:description',
                content: movie.value?.overview
            },
            {
                hid: 'og:image',
                property: 'og:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${movie.value?.backdrop_path}`
            },
            {
                hid: 'og:url',
                property: 'og:url',
                content: `https://movie-browser.vercel.app/movie/${movie.value?.id}`
            },
            {
                hid: 'og:type',
                property: 'og:type',
                content: 'movie'
            },
            {
                hid: 'og:site_name',
                property: 'og:site_name',
                content: 'Movie Browser'
            },
            {
                hid: 'twitter:card',
                name: 'twitter:card',
                content: 'summary_large_image'
            },
            {
                hid: 'twitter:site',
                name: 'twitter:site',
                content: '@movie-browser'
            },
            {
                hid: 'twitter:title',
                name: 'twitter:title',
                content: movie.value?.title
            },
            {
                hid: 'twitter:description',
                name: 'twitter:description',
                content: movie.value?.overview
            },
            {
                hid: 'twitter:image',
                name: 'twitter:image',
                content: `https://image.tmdb.org/t/p/${configuration.images.backdrop_sizes.w780}${movie.value?.backdrop_path}`
            },
            {
                hid: 'twitter:url',
                name: 'twitter:url',
                content: `https://movie-browser.vercel.app/movie/${movie.value?.id}`
            }
        ]
    };
});
</script>

<style scoped lang="less">

:deep(.v-skeleton-loader) {
    .v-skeleton-loader__bone {
        &.v-skeleton-loader__image {
            height: 100%;
        }
    }
}
.pending {
    :deep(.v-skeleton-loader) {
        align-items: start;
        .v-skeleton-loader__bone {
            &.v-skeleton-loader__image {
                height: 50vh;
            }
        }
    }
}
</style>